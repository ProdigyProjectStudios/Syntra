export type VoiceMetric =
  | 'connection-ready' | 'recognition-sdk' | 'final-to-admission' | 'model-response' | 'turn-recovery'
  | 'synthesis-first-byte' | 'synthesis-finish' | 'synthesis-connection'
  | 'synthesis-network' | 'synthesis-service' | 'synthesis-to-audio'
  | 'reply-to-audio' | 'final-transcript-to-audio' | 'interruption-stop';

type Phase = { turn: number; phase: 'queued' | 'admitted' | 'reply' | 'playback'; retry?: boolean };
type Trace = { queued: number; admitted?: number; reply?: number; retried?: boolean };

/** Bounded, local numeric evidence only. No audio, text, account or request identifiers. */
export class VoiceDiagnostics {
  private traces = new Map<number, Trace>();

  record(metric: VoiceMetric, duration: number) {
    if (!Number.isFinite(duration) || duration < 0) return;
    try {
      const name = `syntra.voice.${metric}`;
      const entries = performance.getEntriesByName(name, 'measure');
      if (entries.length >= 64) {
        performance.clearMeasures(name);
        for (const entry of entries.slice(-63)) {
          performance.measure(name, { start: entry.startTime, duration: entry.duration });
        }
      }
      performance.measure(name, { start: Math.max(0, performance.now() - duration), duration });
    } catch { /* Observability must never interrupt a consultation. */ }
  }

  phase(event: Phase) {
    const now = performance.now();
    if (event.phase === 'queued') {
      if (this.traces.size >= 32) this.traces.delete(this.traces.keys().next().value!);
      this.traces.set(event.turn, { queued: now });
      return;
    }
    const trace = this.traces.get(event.turn);
    if (!trace) return; // Recovered requests have no fresh recognition baseline.
    if (event.phase === 'admitted') {
      if (!event.retry) this.record('final-to-admission', now - trace.queued);
      trace.admitted = now;
      trace.retried ||= event.retry;
    } else if (event.phase === 'reply') {
      if (trace.admitted !== undefined) this.record(trace.retried ? 'turn-recovery' : 'model-response', now - trace.admitted);
      trace.reply = now;
    } else if (!event.retry && !trace.retried) {
      if (trace.reply !== undefined) this.record('reply-to-audio', now - trace.reply);
      this.record('final-transcript-to-audio', now - trace.queued);
      this.traces.delete(event.turn);
    }
  }

  clear() { this.traces.clear(); }
}
