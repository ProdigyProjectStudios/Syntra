import { ConsultationError } from "./engine.ts";
export interface NativeCompletion {
  sessionKey: string;
  requestId: string;
  responseId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  visitorText: string;
  reply: string;
}
/** Proof must come from AgentPlace's trusted response history, not request JSON. */
export function verifyNativeCompletion(proof: NativeCompletion | null, sessionKey: string, requestId: string, responseId: string) {
  if (!proof || proof.sessionKey !== sessionKey || proof.requestId !== requestId || proof.responseId !== responseId) {
    throw new ConsultationError(409, "The native response does not belong to this consultation turn.");
  }
  if (proof.status !== "succeeded" || !proof.reply.trim() || !proof.visitorText.trim()) {
    throw new ConsultationError(409, "The native response has not completed successfully.");
  }
  return proof;
}
