/** Only known, public service messages may replace uncertain-outcome recovery copy. */
export function voiceTurnFailureMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("status" in error) || error.status !== 429) return;
  const data = "data" in error ? error.data : undefined;
  const message = data && typeof data === "object" && "error" in data ? data.error : undefined;
  if (typeof message === "string" &&
      /^(?:Syntra's shared AI allowance has been reached|Syntra's daily AI allowance has been reached)/.test(message)) {
    return "Syntra’s daily AI allowance has been reached. It resets at midnight UTC. Your original request is saved; retry it after the reset or after the allowance is increased.";
  }
  if (message === "Please wait a minute before sending more messages.") {
    return "Please wait a minute before retrying. Your original request is saved and will not be sent twice.";
  }
  return "The AI service is temporarily limiting requests. Your original request is saved; please retry later.";
}
