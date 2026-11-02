const PHRASES = [
  'Let me look into that.',
  "I'm analysing those details.",
  "I'll take a closer look.",
];

/** Conservative local gate: social replies and short facts do not need filler speech. */
export function needsThinkingAcknowledgement(text: string) {
  const normalized = text.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ').filter(Boolean);
  if (words.length < 8) return false;
  if (/^(?:(?:hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|yes|no|okay|ok|sure|great|perfect|please|syntra|kryon|nyx)\s*)+$/.test(normalized)) return false;
  if (/^(?:(?:hi|hello|hey)\s+)?(?:how are you|hows it going|whats your name|who are you|can you hear me|are you there|tell me more|say that again|repeat that)(?:\s+(?:today|please|syntra|kryon|nyx))*$/.test(normalized)) return false;
  // Explicit analysis/planning requests, not merely a long utterance or a slow response.
  const reasoning = /\b(?:analyse|analyze|evaluate|compare|calculate|estimate|recommend|diagnose|prioritise|prioritize|trade off|trade offs)\b/;
  const planning = /\b(?:plan|design|architect|optimise|optimize|automate|integrate|implement|build|choose|decide)\b/;
  const request = /\b(?:how|why|which|should|could|can|help|need|want|please)\b/;
  return reasoning.test(normalized) ||
    (planning.test(normalized) && (request.test(normalized) || words.length >= 12));
}

/** Ephemeral audio only: never a model message, caption, or persisted turn. */
export class ThinkingAcknowledgement {
  private current?: AbortController;
  private sequence = 0;
  playing = false;

  start(speak: (text: string, signal: AbortSignal, onStart: () => void) => Promise<void>) {
    this.stop();
    const controller = new AbortController();
    this.current = controller;
    const phrase = PHRASES[this.sequence++ % PHRASES.length];
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      return speak(phrase, controller.signal, () => {
        if (!controller.signal.aborted) this.playing = true;
      });
    }).catch(() => {
      // Optional acknowledgement failure must not fail or retry the real turn.
    }).finally(() => {
      if (this.current === controller) {
        this.current = undefined;
        this.playing = false;
      }
    });
  }

  stop() {
    const previous = this.current;
    this.current = undefined;
    this.playing = false;
    previous?.abort();
  }
}
