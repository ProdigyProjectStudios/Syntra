import type { VoiceControllerDiagnostic } from '@workspace/consultation';

export type VoiceMetric =
  | 'connection-ready' | 'recognition-sdk' | 'final-to-admission' | 'model-response' | 'turn-recovery'
  | 'synthesis-first-byte' | 'synthesis-finish' | 'synthesis-connection'
  | 'synthesis-network' | 'synthesis-service' | 'synthesis-to-audio'
  | 'reply-to-audio' | 'final-transcript-to-audio' | 'interruption-stop';

type Phase = { turn: number; phase: 'queued' | 'admitted' | 'reply' | 'playback'; retry?: boolean };
type Trace = { queued: number; admitted?: number; reply?: number; retried?: boolean };

const STAGES = [
  'connection.open', 'connection.ready', 'connection.state', 'connection.close', 'connection.failed',
  'authorization.ready', 'authorization.refresh', 'authorization.failed',
  'capture.requested', 'capture.ready', 'capture.sample', 'capture.ended', 'capture.muted',
  'audio.state', 'recognition.starting', 'recognition.ready', 'recognition.retiring',
  'recognition.retired', 'recognition.speech-start', 'recognition.speech-end',
  'recognition.interim', 'recognition.final', 'recognition.no-match', 'recognition.duplicate',
  'recognition.stale', 'recognition.ambiguous', 'recognition.canceled', 'recognition.stopped', 'recognition.recovery',
  'recognition.connected', 'recognition.disconnected', 'recognition.observer-unavailable',
  'recognition.first-audio-message', 'recognition.service-phrase', 'recognition.service-turn-start', 'recognition.service-turn-end',
  'synthesis.start', 'synthesis.first-chunk', 'synthesis.complete', 'synthesis.failed',
  'playback.first-scheduled', 'playback.complete', 'playback.stopped',
  'turn.queued', 'turn.admitted', 'turn.reply', 'turn.playback',
  'controller.input', 'controller.interim', 'controller.final', 'controller.no-match',
  'controller.endpoint', 'controller.admission', 'controller.model', 'controller.playback',
  'controller.interrupt', 'controller.close',
] as const;
type DiagnosticStage = typeof STAGES[number];
const NUMBER_FIELDS = ['epoch', 'utterance', 'turn', 'offsetMs', 'durationMs', 'code',
  'liveTracks', 'enabledTracks', 'recognitionTracks', 'queuedFinals', 'sentAudioMessages',
  'sentAudioBytes', 'serviceHypotheses', 'servicePhrases', 'audioSendAgeMs'] as const;
const BOOLEAN_FIELDS = ['accepted', 'timingAvailable', 'reusedProviderId', 'retry',
  'muted', 'inputActive', 'asrActive', 'userSpeaking', 'recognitionPending', 'active',
  'failed', 'playback', 'playbackStarted', 'playbackRetry', 'endpointPending', 'endpointReady', 'socketConnected'] as const;
const OUTCOMES = ['started', 'ended', 'accepted', 'duplicate', 'stale', 'empty', 'rejected',
  'scheduled', 'cancelled', 'blocked', 'admitted', 'completed', 'failed', 'retry'] as const;
const REASONS = ['closed', 'active-turn', 'failed-turn', 'input-pending', 'endpoint-pending',
  'empty-queue', 'queue-limit', 'terminal-result', 'different-result', 'different-epoch'] as const;
const STATES = ['connecting', 'listening', 'thinking', 'speaking', 'closed', 'running', 'suspended', 'interrupted'] as const;
type Fields = Partial<Record<typeof NUMBER_FIELDS[number], number> & Record<typeof BOOLEAN_FIELDS[number], boolean>> & {
  outcome?: typeof OUTCOMES[number]; reason?: typeof REASONS[number]; state?: string;
};
const EVENT_NAME = 'syntra.voice.event';
let connectionSequence = 0;

function safeFields(fields: Fields) {
  const safe: Record<string, string | number | boolean> = {};
  for (const key of NUMBER_FIELDS) {
    const value = fields[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) safe[key] = value;
  }
  for (const key of BOOLEAN_FIELDS) if (typeof fields[key] === 'boolean') safe[key] = fields[key]!;
  if (fields.outcome && (OUTCOMES as readonly string[]).includes(fields.outcome)) safe.outcome = fields.outcome;
  if (fields.reason && (REASONS as readonly string[]).includes(fields.reason)) safe.reason = fields.reason;
  if (fields.state && (STATES as readonly string[]).includes(fields.state)) safe.state = fields.state;
  return safe;
}

/** Bounded, local numeric evidence only. No audio, text, account or request identifiers. */
export class VoiceDiagnostics {
  private traces = new Map<number, Trace>();
  private readonly connection = ++connectionSequence;
  private sequence = 0;
  private counts = new Map<DiagnosticStage, number>();

  /** Only fixed stage names, allowlisted enums, booleans and finite numbers leave this method. */
  event(stage: DiagnosticStage, fields: Fields = {}) {
    if (!(STAGES as readonly string[]).includes(stage)) return;
    try {
      const count = (this.counts.get(stage) ?? 0) + 1;
      this.counts.set(stage, count);
      const entries = performance.getEntriesByName(EVENT_NAME, 'mark');
      if (entries.length >= 512) {
        performance.clearMarks(EVENT_NAME);
        // Compact in batches rather than copying 511 marks on every ASR update.
        for (const entry of entries.slice(-256)) {
          const detail = (entry as PerformanceMark).detail;
          if (!detail || !(STAGES as readonly string[]).includes(detail.stage)) continue;
          performance.mark(EVENT_NAME, { startTime: entry.startTime, detail: {
            connection: Number.isSafeInteger(detail.connection) ? detail.connection : 0,
            sequence: Number.isSafeInteger(detail.sequence) ? detail.sequence : 0,
            count: Number.isSafeInteger(detail.count) ? detail.count : 0,
            stage: detail.stage, ...safeFields(detail),
          } });
        }
      }
      performance.mark(EVENT_NAME, { detail: { connection: this.connection,
        sequence: ++this.sequence, count, stage, ...safeFields(fields) } });
    } catch { /* Diagnostics never affect microphone, turn or playback ownership. */ }
  }

  controller(event: VoiceControllerDiagnostic) {
    this.event(`controller.${event.event}`, { ...event.snapshot, outcome: event.outcome, reason: event.reason });
  }

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
    this.event(`turn.${event.phase}`, { turn: event.turn, retry: Boolean(event.retry) });
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
