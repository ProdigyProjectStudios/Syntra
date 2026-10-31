import { ConsultationError } from "@workspace/consultation";

/** One process only. Database receipt protection does not serialize model calls. */
export function createConversationAdmissionGate() {
  const busy = new Set<string>();
  return {
    async run<T>(key: string, work: () => Promise<T>): Promise<T> {
      if (busy.has(key)) throw new ConsultationError(409, "A response is already being prepared for this session.");
      // Claim synchronously, before work can await even its initial receipt lookup.
      busy.add(key);
      try { return await work(); }
      finally { busy.delete(key); }
    },
  };
}
