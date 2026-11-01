import { createHash } from "node:crypto";
import { ConsultationError } from "@workspace/consultation";
import { createConversationAdmissionGate } from "./conversation-admission.ts";

interface AdmissionClient {
  query(text: string, values: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(destroy?: boolean): void;
  on(event: "error", listener: (error: Error) => void): unknown;
  removeListener(event: "error", listener: (error: Error) => void): unknown;
}
interface TransactionRunner<Client, Transaction> {
  <T>(client: Client, work: (transaction: Transaction) => Promise<T>): Promise<T>;
}

/** Existing PostgreSQL only: transaction-scoped locks also work behind transaction
 * poolers. The callback must use the provided transaction for every repository
 * operation; checking out another connection can deadlock a saturated pool. */
export function createPostgresConversationAdmissionGate<Client extends AdmissionClient, Transaction>(
  pool: { connect(): Promise<Client> },
  transaction: TransactionRunner<Client, Transaction>,
  timeoutMs = 5000,
) {
  const local = createConversationAdmissionGate();
  const unavailable = () => new ConsultationError(503, "The consultation connection could not be confirmed. Retry your original request.");
  async function bounded<T>(operation: Promise<T>, late?: (value: T) => void): Promise<T> {
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(unavailable()); }, timeoutMs);
    });
    void operation.then(value => {
      if (timedOut) { try { late?.(value); } catch { /* Retired cleanup cannot revive a request. */ } }
    }, () => {});
    try { return await Promise.race([operation, timeout]); }
    finally { clearTimeout(timer); }
  }
  return {
    run<T>(key: string, work: (transaction: Transaction) => Promise<T>): Promise<T> {
      return local.run(key, async () => {
        let client: Client;
        try { client = await bounded(pool.connect(), late => late.release(true)); }
        catch { throw unavailable(); }
        // Keys contain no raw owner identity and never leave SQL parameters.
        const lockKey = createHash("sha256").update(`syntra:consultation:${key}`).digest().readBigInt64BE().toString();
        let lost = false, released = false, committed = false;
        const connectionLost = () => { lost = true; };
        const destroy = () => {
          if (released) return;
          released = true;
          client.release(true);
        };
        client.on("error", connectionLost);
        try {
          const result = await transaction(client, async database => {
            let lock;
            try { lock = await bounded(client.query("select pg_try_advisory_xact_lock($1::bigint) as acquired", [lockKey])); }
            catch {
              // Interrupt an unresponsive query before the runner attempts rollback.
              destroy();
              throw unavailable();
            }
            if (lock.rows[0]?.acquired !== true) throw new ConsultationError(409, "A response is already being prepared for this session.");
            if (lost) throw unavailable();
            const value = await work(database);
            if (lost) throw unavailable();
            return value;
          });
          if (lost) throw unavailable();
          committed = true;
          return result;
        } finally {
          client.removeListener("error", connectionLost);
          // Reuse only a confirmed committed transaction. On any failure discard
          // the connection, including uncertain BEGIN/COMMIT/ROLLBACK outcomes.
          if (!released) client.release(!committed || lost);
        }
      });
    },
  };
}
