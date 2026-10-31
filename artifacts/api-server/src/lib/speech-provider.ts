import { ConsultationError } from "@workspace/consultation";

type SpeechEnvironment = Partial<Record<"SYNTRA_VOICE_PROVIDER" | "AZURE_SPEECH_KEY" | "AZURE_SPEECH_REGION", string>>;
export function speechConfiguration(env: SpeechEnvironment = process.env) {
  const region = env.AZURE_SPEECH_REGION?.trim() ?? "";
  const enabled = env.SYNTRA_VOICE_PROVIDER === "azure" && Boolean(env.AZURE_SPEECH_KEY) && /^[a-z][a-z0-9]{1,31}$/.test(region);
  return { enabled, provider: enabled ? "azure" as const : "none" as const, region: enabled ? region : null };
}

/** Development gateway only. Native AgentPlace never requests this credential. */
export function createSpeechTokenBroker(
  env: SpeechEnvironment = process.env,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  let cached: { token: string; expiresAt: number } | undefined;
  let pending: Promise<{ token: string; expiresAt: number }> | undefined;
  const attempts = new Map<string, { count: number; until: number }>();
  let total = { count: 0, until: 0 };

  return async (owner: string) => {
    const config = speechConfiguration(env);
    if (!config.enabled || !config.region) throw new ConsultationError(503, "Development voice is not connected. Continue in text for now.");
    const timestamp = now();
    for (const [key, value] of attempts) if (value.until <= timestamp) attempts.delete(key);
    const quota = attempts.get(owner) ?? { count: 0, until: timestamp + 600_000 };
    if (total.until <= timestamp) total = { count: 0, until: timestamp + 600_000 };
    // These guard this development process; Azure resource quotas remain authoritative.
    if (quota.count >= 8 || total.count >= 120) throw new ConsultationError(429, "Voice is receiving too many connection requests. Please wait before reconnecting.");
    quota.count++; total.count++; attempts.set(owner, quota);
    if (!cached || cached.expiresAt - timestamp < 120_000) {
      pending ??= (async () => {
        const response = await request(`https://${config.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
          method: "POST",
          headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY! },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        });
        if (!response.ok) throw new ConsultationError(503, "The speech provider could not authorize this connection. Continue in text or reconnect later.");
        const token = (await response.text()).trim();
        if (!token || token.length > 16_384 || /\s/.test(token)) throw new ConsultationError(503, "The speech provider returned an invalid credential.");
        return { token, expiresAt: now() + 540_000 };
      })();
      try { cached = await pending; } finally { pending = undefined; }
    }
    return { ...cached, provider: "azure" as const, region: config.region };
  };
}

export const issueSpeechToken = createSpeechTokenBroker();
