const PHRASES = [
  'Let me look into that.',
  "I'm analysing those details.",
  "I'll take a closer look.",
];

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
