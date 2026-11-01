import { pool } from "@workspace/db";
import { ConsultationError } from "@workspace/consultation";

type Counter = { key: string; amount: number; limit: number; expiresAt: Date };
const configuredLimit = (key: string, fallback: number) => {
  const value = process.env[key];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${key}`);
  return parsed;
};

/** Atomic across replicas. Denials roll back all counters; database failure fails closed. */
export async function reserveUsage(counters: Counter[]): Promise<void> {
  const client = await pool.connect();
  let reusable = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('syntra:ai:usage'))");
    for (const counter of counters) {
      if (counter.amount > counter.limit) throw new ConsultationError(429, "Syntra's shared AI allowance has been reached. Please try again later.");
      const result = await client.query(
        `INSERT INTO ai_usage_windows (key, used, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET used = ai_usage_windows.used + EXCLUDED.used
         WHERE ai_usage_windows.used + EXCLUDED.used <= $4 RETURNING used`,
        [counter.key, counter.amount, counter.expiresAt, counter.limit],
      );
      if (!result.rowCount) throw new ConsultationError(429, "Syntra's shared AI allowance has been reached. Please try again later.");
    }
    await client.query("DELETE FROM ai_usage_windows WHERE expires_at < now() - interval '2 days'");
    await client.query("COMMIT");
    reusable = true;
  } catch (error) {
    try { await client.query("ROLLBACK"); reusable = true; } catch {}
    if (error instanceof ConsultationError) throw error;
    throw new ConsultationError(503, "AI usage controls are temporarily unavailable. Please try again shortly.");
  } finally {
    client.release(!reusable);
  }
}

export async function reserveVisitorAnalysis(owner: string, tool: string, limit: number): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(owner)) throw new ConsultationError(503, "A private visitor session is required.");
  const hour = Math.floor(Date.now() / 3_600_000);
  await reserveUsage([{ key: `visitor:${tool}:${hour}:${owner}`, amount: 1, limit,
    expiresAt: new Date((hour + 1) * 3_600_000) }]);
}

/** Conservative token ceiling, charged even on failure; no refunds that could enable retry abuse.
 * UTF-8 bytes bound input tokens. Reserve every allowed provider attempt, including retries.
 */
export async function reserveModelUsage(messages: unknown, outputTokens: number, attempts = 1): Promise<void> {
  const day = Math.floor(Date.now() / 86_400_000);
  const expiresAt = new Date((day + 1) * 86_400_000);
  const tokenCeiling = (Buffer.byteLength(JSON.stringify(messages), "utf8") + outputTokens + 1024) * attempts;
  await reserveUsage([
    { key: `global:tokens:${day}`, amount: tokenCeiling,
      limit: configuredLimit("SYNTRA_AI_DAILY_TOKEN_BUDGET", 200_000), expiresAt },
    { key: `global:requests:${day}`, amount: attempts,
      limit: configuredLimit("SYNTRA_AI_DAILY_REQUEST_BUDGET", 100), expiresAt },
  ]);
}
