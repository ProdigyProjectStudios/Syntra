/** Unlock output in the initiating gesture, before session/SDK/network awaits.
 * No microphone is requested here. A connection adopts the context exactly once;
 * cancellation closes only an unadopted context, never a newer connection's audio. */
export function createAudioPreparation() {
  let pending: { context: AudioContext; release: () => void; detach: () => void } | undefined;
  const close = (context: AudioContext) => {
    try { void context.close().catch(() => {}); } catch { /* Best-effort unused-context cleanup. */ }
  };
  return {
    prepare(signal: AbortSignal) {
      pending?.release();
      if (signal.aborted || typeof window === 'undefined' || !window.AudioContext) return;
      let context: AudioContext;
      try { context = new window.AudioContext(); }
      catch { return; } // connect reports unsupported/failed audio with the normal recovery UI.
      const entry = {
        context,
        detach: () => signal.removeEventListener('abort', release),
        release,
      };
      function release() {
        if (pending !== entry) return;
        pending = undefined;
        entry.detach();
        close(context);
      }
      pending = entry;
      signal.addEventListener('abort', release, { once: true });
      // Invoke resume now, not in a Promise callback: browsers check transient activation.
      try { void context.resume().catch(() => {}); } catch { /* connect verifies readiness. */ }
      if (signal.aborted) release();
    },
    take(): AudioContext | undefined {
      const entry = pending;
      pending = undefined;
      entry?.detach();
      return entry?.context;
    },
  };
}
