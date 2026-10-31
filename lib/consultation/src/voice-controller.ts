import type { Depth, SpecialistId, TurnInput, TurnReply, VoiceEvent } from "./types.ts";
import { normalizeSpecialist } from "./specialists.ts";

export interface VoiceTurnPhase {
  /** Connection-local sequence only; no transcript, request or account identifiers. */
  turn: number;
  phase: "queued" | "admitted" | "reply" | "playback";
  retry?: boolean;
}

export interface VoiceControllerDiagnostic {
  event: "input" | "interim" | "final" | "no-match" | "endpoint" | "admission" | "model" | "playback" | "interrupt" | "close";
  outcome: "started" | "ended" | "accepted" | "duplicate" | "stale" | "empty" | "rejected" | "scheduled" | "cancelled" | "blocked" | "admitted" | "completed" | "failed" | "retry";
  reason?: "closed" | "active-turn" | "failed-turn" | "input-pending" | "endpoint-pending" | "empty-queue" | "queue-limit" | "terminal-result" | "different-result" | "different-epoch";
  /** A value-only snapshot: never include text, result/request IDs or customer data. */
  snapshot: {
    userSpeaking: boolean;
    recognitionPending: boolean;
    queuedFinals: number;
    active: boolean;
    failed: boolean;
    playback: boolean;
    playbackStarted: boolean;
    playbackRetry: boolean;
    endpointPending: boolean;
    endpointReady: boolean;
  };
}

export interface VoiceTurnPorts {
  /** The existing consultation runtime owns persistence and idempotent request replay. */
  send(input: TurnInput): Promise<TurnReply>;
  /** Resolve when playback finishes, not when synthesis/download finishes. */
  speak(text: string, signal: AbortSignal, onPlaybackStart: () => void): Promise<void>;
  /** Stop local output immediately; cancellation must not wait for a network response. */
  stopPlayback(): void;
  emit(event: VoiceEvent): void;
  getDepth(): Depth;
  getSpecialist?: () => SpecialistId;
  requestId?: () => string;
  /** An uncertain request restored by a scoped adapter. It is never automatically resent. */
  pendingTurn?: TurnInput;
  /** Persist before admission. Clearing must compare the adapter's previous request ID. */
  onPendingChange?: (input: TurnInput | null) => void;
  /** Optional local diagnostics; failures must never affect conversation decisions. */
  onTurnPhase?: (event: VoiceTurnPhase) => void;
  /** Opt-in state tracing; the consumer owns retention and must not add private data. */
  onDiagnostic?: (event: VoiceControllerDiagnostic) => void;
}

export interface VoiceTurnOptions {
  endOfTurnDelayMs?: number;
  maxQueuedCharacters?: number;
  maxQueuedFinals?: number;
  /** Return a cancellation callback. Tests can advance the same endpointing clock manually. */
  schedule?: (callback: () => void, delayMs: number) => () => void;
}

type Attempt = { input: TurnInput; epoch: number; turn: number; retry: boolean; reply?: TurnReply };
type Playback = { reply: TurnReply; epoch: number; turn: number; retry: boolean; abort: AbortController; started: boolean };
type Replay = { reply: TurnReply; epoch: number; turn: number };
type Interrupted = { epoch: number; turn: number; reply?: TurnReply; confirmedNoMatch: boolean };

/**
 * One conversation, one model request at a time. Audio can be canceled immediately,
 * but a request already admitted by the consultation runtime must settle or replay
 * under the same request ID. This controller never treats an interrupted speaker
 * as proof that a persisted model turn was canceled.
 */
export class ConversationVoiceController {
  private readonly ports: VoiceTurnPorts;
  private readonly options: Required<VoiceTurnOptions>;
  private readonly finals = new Map<string, string>();
  private readonly terminalNoMatches = new Set<string>();
  private queued: Array<{ id: string; text: string }> = [];
  private queuedDepth: Depth | null = null;
  private queuedSpecialist: SpecialistId | null = null;
  private queuedTurn: number | null = null;
  private turnSequence = 0;
  private ready = false;
  private cancelTimer: (() => void) | null = null;
  private active: Attempt | null = null;
  private failed: Attempt | null = null;
  private playback: Playback | null = null;
  private playbackRetry: Replay | null = null;
  private interrupted: Interrupted | null = null;
  private interimResult: { id: string; text: string } | null = null;
  // Physical speech end can precede its final recognition result. Keep that
  // unresolved utterance from changing specialist or admitting a partial turn.
  private recognitionPending = false;
  private userSpeaking = false;
  private epoch = 0;
  private closed = false;
  private lastState: "listening" | "thinking" | "speaking" | null = null;

  constructor(ports: VoiceTurnPorts, options: VoiceTurnOptions = {}) {
    this.ports = ports;
    this.options = {
      endOfTurnDelayMs: Math.max(0, options.endOfTurnDelayMs ?? 300),
      maxQueuedCharacters: Math.max(1, Math.min(12000, options.maxQueuedCharacters ?? 12000)),
      maxQueuedFinals: Math.max(1, options.maxQueuedFinals ?? 16),
      schedule: options.schedule ?? ((callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      }),
    };
    if (ports.pendingTurn) {
      this.failed = { input: { ...ports.pendingTurn }, epoch: this.epoch, turn: ++this.turnSequence, retry: true };
      this.error("A previous voice request still needs confirmation. Retry that request before continuing.", "turn");
    }
  }

  speechStarted(): void {
    if (this.closed) return;
    this.cancelEndpoint();
    this.ready = false;
    const started = !this.userSpeaking;
    if (started) this.invalidatePlayback(true);
    this.recognitionPending = true;
    this.userSpeaking = true;
    if (started) this.emit({ type: "input", speaking: true });
    this.state("listening");
    if (started) this.diagnostic("input", "started");
  }

  speechEnded(): void {
    if (this.closed) return;
    const wasSpeaking = this.userSpeaking;
    this.userSpeaking = false;
    if (wasSpeaking) this.emit({ type: "input", speaking: false });
    if (this.queued.length && !this.recognitionPending) this.scheduleEndpoint();
    this.refreshState();
    this.diagnostic("input", "ended");
  }

  interim(id: string, text: string): void {
    if (this.closed) return;
    if (!text.trim()) { this.diagnostic("interim", "empty"); return; }
    if (this.finals.has(id) || this.terminalNoMatches.has(id)) {
      this.diagnostic("interim", "stale", "terminal-result");
      return;
    }
    this.speechStarted();
    this.interimResult = { id, text: text.trim() };
    this.emitVisitorCaption();
    this.diagnostic("interim", "accepted");
  }

  final(id: string, text: string): boolean {
    if (this.closed) return false;
    if (this.terminalNoMatches.has(id)) { this.diagnostic("final", "stale", "terminal-result"); return false; }
    const content = text.trim();
    if (!id || !content) {
      this.diagnostic("final", "empty");
      if (id) this.noMatch(id);
      return false;
    }
    if (this.finals.has(id)) {
      if (this.finals.get(id) !== content) this.error("A repeated transcript changed unexpectedly. Please repeat that phrase.");
      // An old final is not proof that a newer speech-start/partial has ended.
      this.diagnostic("final", "duplicate", "terminal-result");
      return false;
    }
    const currentResult = !this.interimResult || this.interimResult.id === id;
    // A provider may deliver a final without a preceding speech-start callback.
    this.invalidatePlayback();
    const combinedLength = this.queued.reduce((sum, item) => sum + item.text.length + 1, content.length);
    if (this.queued.length >= this.options.maxQueuedFinals || combinedLength > this.options.maxQueuedCharacters) {
      if (currentResult) this.finishRecognition(true);
      this.emitVisitorCaption();
      if (this.queued.length && !this.recognitionPending) this.scheduleEndpoint();
      this.error("Please pause while the current request finishes. The latest phrase was not queued; repeat it afterwards.");
      this.refreshState();
      this.diagnostic("final", "rejected", "queue-limit");
      return false;
    }
    if (currentResult) this.finishRecognition(false);
    this.finals.set(id, content);
    if (!this.queued.length) {
      this.queuedDepth = this.ports.getDepth();
      this.queuedSpecialist = normalizeSpecialist(this.ports.getSpecialist?.());
      this.queuedTurn = ++this.turnSequence;
      this.phase({ turn: this.queuedTurn, phase: "queued" });
    }
    this.queued.push({ id, text: content });
    this.emitVisitorCaption();
    if (!this.recognitionPending) this.scheduleEndpoint();
    if (this.failed) this.error("Your latest words are held here. Retry the earlier request first so it cannot be sent twice.", "turn");
    this.refreshState();
    this.diagnostic("final", "accepted");
    return true;
  }

  /** A terminal recognition result, not a VAD/silence guess. Omit id only when
   * the adapter explicitly abandons the current recognition (for example mute). */
  noMatch(id?: string): void {
    if (this.closed) return;
    if (id && (this.finals.has(id) || this.terminalNoMatches.has(id))) {
      this.diagnostic("no-match", "duplicate", "terminal-result");
      return;
    }
    if (id && this.interimResult && this.interimResult.id !== id) {
      this.diagnostic("no-match", "stale", "different-result");
      return;
    }
    if (id) this.terminalNoMatches.add(id);
    this.finishRecognition(true);
    this.emitVisitorCaption();
    if (this.interrupted) this.interrupted.confirmedNoMatch = true;
    if (this.queued.length) this.scheduleEndpoint();
    this.offerInterruptedReply();
    this.refreshState();
    this.diagnostic("no-match", "accepted");
  }

  /** Flush only finalized content. Providers may call this at a trusted end-of-turn boundary. */
  flush(): void {
    if (this.closed) return;
    if (this.userSpeaking || this.recognitionPending) {
      this.diagnostic("endpoint", "blocked", "input-pending");
      return;
    }
    this.cancelEndpoint();
    this.ready = true;
    this.diagnostic("endpoint", "completed");
    this.drain();
  }

  interrupt(): void {
    if (this.closed) return;
    this.invalidatePlayback();
    this.state("listening");
    this.diagnostic("interrupt", "completed");
  }

  canSwitchSpecialist(): boolean {
    return !this.closed && !this.active && !this.failed && !this.queued.length && !this.userSpeaking && !this.recognitionPending;
  }

  retryTurn(): void {
    if (this.closed || this.active || !this.failed) return;
    const attempt = this.failed;
    attempt.retry = true;
    this.failed = null;
    this.active = attempt;
    this.refreshState();
    this.diagnostic("admission", "retry");
    void this.run(attempt);
  }

  retryPlayback(): void {
    if (this.closed || this.active || this.failed || this.queued.length || this.userSpeaking || this.recognitionPending || !this.playbackRetry) return;
    const retry = this.playbackRetry;
    if (retry.epoch !== this.epoch) return;
    this.playbackRetry = null;
    this.diagnostic("playback", "retry");
    this.startPlayback(retry.reply, retry.epoch, retry.turn, true);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelEndpoint();
    this.queued = [];
    this.queuedDepth = null;
    this.queuedSpecialist = null;
    this.queuedTurn = null;
    this.interimResult = null;
    this.recognitionPending = false;
    this.finals.clear();
    this.terminalNoMatches.clear();
    this.invalidatePlayback();
    this.diagnostic("close", "completed");
    // Do not clear an admitted request from durable retry storage. Its eventual
    // completion is intentionally silent; the next adapter can replay its receipt.
  }

  private emit(event: VoiceEvent): void {
    if (!this.closed) this.ports.emit(event);
  }

  private phase(event: VoiceTurnPhase): void {
    if (this.closed) return;
    try { this.ports.onTurnPhase?.(event); } catch { /* Diagnostics cannot fail a turn. */ }
  }

  private diagnostic(event: VoiceControllerDiagnostic["event"], outcome: VoiceControllerDiagnostic["outcome"], reason?: VoiceControllerDiagnostic["reason"]): void {
    if (!this.ports.onDiagnostic || (this.closed && event !== "close")) return;
    const snapshot: VoiceControllerDiagnostic["snapshot"] = {
      userSpeaking: this.userSpeaking,
      recognitionPending: this.recognitionPending,
      queuedFinals: this.queued.length,
      active: this.active !== null,
      failed: this.failed !== null,
      playback: this.playback !== null,
      playbackStarted: this.playback?.started ?? false,
      playbackRetry: this.playbackRetry !== null,
      endpointPending: this.cancelTimer !== null,
      endpointReady: this.ready,
    };
    try { this.ports.onDiagnostic({ event, outcome, ...(reason ? { reason } : {}), snapshot }); }
    catch { /* State tracing must not change admission, recovery or audio behavior. */ }
  }

  private finishRecognition(clearInterim: boolean): void {
    const interim = this.interimResult;
    this.interimResult = null;
    const wasPending = this.userSpeaking || this.recognitionPending;
    this.userSpeaking = false;
    this.recognitionPending = false;
    if (wasPending) this.emit({ type: "input", speaking: false });
    if (clearInterim && interim) this.emit({ type: "transcript-clear", role: "visitor", id: interim.id });
  }

  private emitVisitorCaption(): void {
    const prefix = this.queued.map(fragment => fragment.text).join(" ");
    if (this.interimResult) {
      this.emit({ type: "transcript", id: this.interimResult.id, role: "visitor",
        text: [prefix, this.interimResult.text].filter(Boolean).join(" "), final: false });
    } else if (this.queued.length) {
      this.emit({ type: "transcript", id: this.queued[0].id, role: "visitor", text: prefix, final: true });
    }
  }

  private state(state: "listening" | "thinking" | "speaking"): void {
    if (this.closed || this.lastState === state) return;
    this.lastState = state;
    this.emit({ type: "state", state });
  }

  private refreshState(): void {
    this.state(this.userSpeaking || this.recognitionPending || this.failed ? "listening"
      : this.playback?.started ? "speaking"
      : this.queued.length || this.playback || this.active?.epoch === this.epoch ||
        (this.active && this.interrupted?.turn === this.active.turn && this.interrupted.confirmedNoMatch) ? "thinking"
      : "listening");
  }

  private error(message: string, recovery?: "turn" | "playback"): void {
    // A queue/provider notice must not replace the only safe recovery action for
    // an uncertain send. The original request is distinct from newer held words.
    const effectiveRecovery = this.failed ? "turn" : recovery;
    const originalTurn = effectiveRecovery === "turn" ? this.failed?.input ?? this.active?.input : undefined;
    this.emit({ type: "error", message, recoverable: true, retryable: Boolean(effectiveRecovery),
      ...(effectiveRecovery ? { recovery: effectiveRecovery } : {}),
      ...(originalTurn ? { originalTurn: { ...originalTurn } } : {}) });
  }

  private cancelEndpoint(): void {
    const pending = this.cancelTimer !== null;
    this.cancelTimer?.();
    this.cancelTimer = null;
    if (pending) this.diagnostic("endpoint", "cancelled");
  }

  private scheduleEndpoint(): void {
    this.cancelEndpoint();
    this.ready = false;
    this.cancelTimer = this.options.schedule(() => {
      this.cancelTimer = null;
      this.flush();
    }, this.options.endOfTurnDelayMs);
    this.diagnostic("endpoint", "scheduled");
  }

  private invalidatePlayback(provisional = false): void {
    let interrupted: Interrupted | null = null;
    if (provisional && !this.queued.length) {
      const saved = this.playback ?? this.playbackRetry;
      const outstanding = this.active ?? this.failed;
      if (saved) interrupted = { epoch: this.epoch, turn: saved.turn, reply: saved.reply, confirmedNoMatch: false };
      else if (outstanding?.epoch === this.epoch) interrupted = { epoch: this.epoch, turn: outstanding.turn, reply: outstanding.reply, confirmedNoMatch: false };
      else if (this.interrupted) interrupted = { ...this.interrupted, confirmedNoMatch: false };
    }
    this.epoch++;
    this.playbackRetry = null;
    const previous = this.playback;
    this.playback = null;
    this.interrupted = interrupted ? { ...interrupted, epoch: this.epoch } : null;
    previous?.abort.abort();
    // The output transport can stop even if its synthesis promise never settles.
    this.ports.stopPlayback();
    if (previous) this.diagnostic("playback", "cancelled");
  }

  private offerInterruptedReply(): void {
    const interrupted = this.interrupted;
    if (!interrupted?.confirmedNoMatch || !interrupted.reply || interrupted.epoch !== this.epoch ||
        this.closed || this.active || this.failed || this.queued.length || this.userSpeaking || this.recognitionPending) return;
    this.playbackRetry = { reply: interrupted.reply, epoch: interrupted.epoch, turn: interrupted.turn };
    this.interrupted = null;
    this.error("I did not catch another complete request. Your previous reply is saved; replay it or continue speaking.", "playback");
  }

  private drain(): void {
    if (this.closed || this.active || this.failed || this.userSpeaking || this.recognitionPending || !this.ready || !this.queued.length) {
      this.refreshState();
      this.diagnostic("admission", "blocked", this.closed ? "closed"
        : this.active ? "active-turn" : this.failed ? "failed-turn"
        : this.userSpeaking || this.recognitionPending ? "input-pending"
        : !this.ready ? "endpoint-pending" : "empty-queue");
      return;
    }
    const input: TurnInput = {
      content: this.queued.map(item => item.text).join(" "),
      depth: this.queuedDepth ?? this.ports.getDepth(),
      specialist: this.queuedSpecialist ?? normalizeSpecialist(this.ports.getSpecialist?.()),
      requestId: this.ports.requestId?.() ?? crypto.randomUUID(),
    };
    const turn = this.queuedTurn ?? ++this.turnSequence;
    this.queued = [];
    this.queuedDepth = null;
    this.queuedSpecialist = null;
    this.queuedTurn = null;
    this.ready = false;
    const attempt: Attempt = { input, epoch: this.epoch, turn, retry: false };
    this.active = attempt;
    this.refreshState();
    void this.run(attempt);
  }

  private async run(attempt: Attempt): Promise<void> {
    let requested = false;
    try {
      if (!attempt.reply) {
        // A storage failure prevents a new external admission, preserving a safe retry.
        this.ports.onPendingChange?.({ ...attempt.input });
        if (this.closed) return;
        this.phase({ turn: attempt.turn, phase: "admitted", retry: attempt.retry });
        this.diagnostic("admission", "admitted");
        requested = true;
        attempt.reply = await this.ports.send(attempt.input);
        if (this.closed) return;
        this.phase({ turn: attempt.turn, phase: "reply", retry: attempt.retry });
        this.diagnostic("model", "completed");
        this.emit({ type: "conversation-updated" });
      }
      if (this.closed) return;
      this.ports.onPendingChange?.(null);
      this.active = null;
      if (this.interrupted?.turn === attempt.turn) {
        this.interrupted.reply = attempt.reply;
        this.offerInterruptedReply();
      } else if (attempt.epoch === this.epoch && !this.queued.length && !this.userSpeaking && !this.recognitionPending) {
        this.startPlayback(attempt.reply, attempt.epoch, attempt.turn, attempt.retry);
      } else {
        this.diagnostic("playback", "blocked", attempt.epoch !== this.epoch ? "different-epoch" : "input-pending");
      }
      this.drain();
    } catch {
      if (this.closed) return;
      this.active = null;
      this.failed = attempt;
      this.error(this.queued.length
        ? "The earlier response could not be confirmed. Your newer words are held here; retry the original request first."
        : "The response could not be confirmed. Retry this request; your words and request ID are preserved.", "turn");
      this.refreshState();
      this.diagnostic(requested && !attempt.reply ? "model" : "admission", "failed");
    }
  }

  private startPlayback(reply: TurnReply, epoch: number, turn: number, retry: boolean): void {
    if (this.closed || epoch !== this.epoch) return;
    const playback: Playback = { reply, epoch, turn, retry, abort: new AbortController(), started: false };
    this.playback = playback;
    this.refreshState();
    this.diagnostic("playback", "scheduled");
    void Promise.resolve().then(async () => {
      if (this.closed || this.playback !== playback || playback.abort.signal.aborted) return;
      await this.ports.speak(reply.message.content, playback.abort.signal, () => {
        if (this.closed) return;
        if (this.playback !== playback || playback.abort.signal.aborted || epoch !== this.epoch) {
          this.diagnostic("playback", "stale", "different-epoch");
          return;
        }
        if (playback.started) { this.diagnostic("playback", "duplicate"); return; }
        playback.started = true;
        this.phase({ turn, phase: "playback", retry });
        this.emit({ type: "transcript", id: `advisor:${reply.message.id}`, role: "advisor", text: reply.message.content, final: true });
        this.state("speaking");
        this.diagnostic("playback", "started");
      });
      if (this.closed || this.playback !== playback || playback.abort.signal.aborted) return;
      this.playback = null;
      this.refreshState();
      this.diagnostic("playback", "completed");
    }).catch(() => {
      if (this.closed || this.playback !== playback || playback.abort.signal.aborted || epoch !== this.epoch) return;
      this.playback = null;
      this.playbackRetry = { reply, epoch, turn };
      this.error("The reply is saved, but audio playback failed. Play the reply again or continue speaking.", "playback");
      this.refreshState();
      this.diagnostic("playback", "failed");
    });
  }
}
