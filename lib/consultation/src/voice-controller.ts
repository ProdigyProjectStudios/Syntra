import type { Depth, SpecialistId, TurnInput, TurnReply, VoiceEvent } from "./types.ts";
import { normalizeSpecialist } from "./specialists.ts";

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
}

export interface VoiceTurnOptions {
  endOfTurnDelayMs?: number;
  maxQueuedCharacters?: number;
  maxQueuedFinals?: number;
  /** Return a cancellation callback. Tests can advance the same endpointing clock manually. */
  schedule?: (callback: () => void, delayMs: number) => () => void;
}

type Attempt = { input: TurnInput; epoch: number; reply?: TurnReply };
type Playback = { reply: TurnReply; epoch: number; abort: AbortController; started: boolean };

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
  private queued: Array<{ id: string; text: string }> = [];
  private queuedDepth: Depth | null = null;
  private queuedSpecialist: SpecialistId | null = null;
  private ready = false;
  private cancelTimer: (() => void) | null = null;
  private active: Attempt | null = null;
  private failed: Attempt | null = null;
  private playback: Playback | null = null;
  private playbackRetry: { reply: TurnReply; epoch: number } | null = null;
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
      this.failed = { input: { ...ports.pendingTurn }, epoch: this.epoch };
      this.error("A previous voice request still needs confirmation. Retry that request before continuing.", "turn");
    }
  }

  speechStarted(): void {
    if (this.closed) return;
    this.cancelEndpoint();
    this.ready = false;
    if (!this.userSpeaking) {
      this.invalidatePlayback();
      this.emit({ type: "input", speaking: true });
    }
    this.userSpeaking = true;
    this.state("listening");
  }

  speechEnded(): void {
    if (this.closed) return;
    if (this.userSpeaking) this.emit({ type: "input", speaking: false });
    this.userSpeaking = false;
    if (this.queued.length) this.scheduleEndpoint();
    this.refreshState();
  }

  interim(id: string, text: string): void {
    if (this.closed || !text.trim() || this.finals.has(id)) return;
    this.speechStarted();
    this.emit({ type: "transcript", id, role: "visitor", text, final: false });
  }

  final(id: string, text: string): boolean {
    if (this.closed) return false;
    const content = text.trim();
    if (!id || !content) return false;
    if (this.finals.has(id)) {
      if (this.finals.get(id) !== content) this.error("A repeated transcript changed unexpectedly. Please repeat that phrase.");
      return false;
    }
    // A provider may deliver a final without a preceding speech-start callback.
    this.invalidatePlayback();
    if (this.userSpeaking) this.emit({ type: "input", speaking: false });
    this.userSpeaking = false;
    const combinedLength = this.queued.reduce((sum, item) => sum + item.text.length + 1, content.length);
    if (this.queued.length >= this.options.maxQueuedFinals || combinedLength > this.options.maxQueuedCharacters) {
      this.error("Please pause while the current request finishes. The latest phrase was not queued; repeat it afterwards.");
      this.refreshState();
      return false;
    }
    this.finals.set(id, content);
    if (!this.queued.length) {
      this.queuedDepth = this.ports.getDepth();
      this.queuedSpecialist = normalizeSpecialist(this.ports.getSpecialist?.());
    }
    this.queued.push({ id, text: content });
    this.emit({ type: "transcript", id, role: "visitor", text: content, final: true });
    this.scheduleEndpoint();
    if (this.failed) this.error("Your latest words are held here. Retry the earlier request first so it cannot be sent twice.", "turn");
    this.refreshState();
    return true;
  }

  /** Flush only finalized content. Providers may call this at a trusted end-of-turn boundary. */
  flush(): void {
    if (this.closed || this.userSpeaking) return;
    this.cancelEndpoint();
    this.ready = true;
    this.drain();
  }

  interrupt(): void {
    if (this.closed) return;
    this.invalidatePlayback();
    this.state("listening");
  }

  canSwitchSpecialist(): boolean {
    return !this.closed && !this.active && !this.failed && !this.queued.length && !this.userSpeaking;
  }

  retryTurn(): void {
    if (this.closed || this.active || !this.failed) return;
    const attempt = this.failed;
    this.failed = null;
    this.active = attempt;
    this.refreshState();
    void this.run(attempt);
  }

  retryPlayback(): void {
    if (this.closed || this.active || this.failed || this.queued.length || this.userSpeaking || !this.playbackRetry) return;
    const retry = this.playbackRetry;
    if (retry.epoch !== this.epoch) return;
    this.playbackRetry = null;
    this.startPlayback(retry.reply, retry.epoch);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelEndpoint();
    this.queued = [];
    this.queuedDepth = null;
    this.queuedSpecialist = null;
    this.finals.clear();
    this.invalidatePlayback();
    // Do not clear an admitted request from durable retry storage. Its eventual
    // completion is intentionally silent; the next adapter can replay its receipt.
  }

  private emit(event: VoiceEvent): void {
    if (!this.closed) this.ports.emit(event);
  }

  private state(state: "listening" | "thinking" | "speaking"): void {
    if (this.closed || this.lastState === state) return;
    this.lastState = state;
    this.emit({ type: "state", state });
  }

  private refreshState(): void {
    this.state(this.userSpeaking || this.failed ? "listening"
      : this.playback?.started ? "speaking"
      : this.queued.length || this.playback || this.active?.epoch === this.epoch ? "thinking"
      : "listening");
  }

  private error(message: string, recovery?: "turn" | "playback"): void {
    this.emit({ type: "error", message, recoverable: true, retryable: Boolean(recovery), ...(recovery ? { recovery } : {}) });
  }

  private cancelEndpoint(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  private scheduleEndpoint(): void {
    this.cancelEndpoint();
    this.ready = false;
    this.cancelTimer = this.options.schedule(() => {
      this.cancelTimer = null;
      this.flush();
    }, this.options.endOfTurnDelayMs);
  }

  private invalidatePlayback(): void {
    this.epoch++;
    this.playbackRetry = null;
    const previous = this.playback;
    this.playback = null;
    previous?.abort.abort();
    // The output transport can stop even if its synthesis promise never settles.
    this.ports.stopPlayback();
  }

  private drain(): void {
    if (this.closed || this.active || this.failed || this.userSpeaking || !this.ready || !this.queued.length) {
      this.refreshState();
      return;
    }
    const input: TurnInput = {
      content: this.queued.map(item => item.text).join(" "),
      depth: this.queuedDepth ?? this.ports.getDepth(),
      specialist: this.queuedSpecialist ?? normalizeSpecialist(this.ports.getSpecialist?.()),
      requestId: this.ports.requestId?.() ?? crypto.randomUUID(),
    };
    this.queued = [];
    this.queuedDepth = null;
    this.queuedSpecialist = null;
    this.ready = false;
    const attempt: Attempt = { input, epoch: this.epoch };
    this.active = attempt;
    this.refreshState();
    void this.run(attempt);
  }

  private async run(attempt: Attempt): Promise<void> {
    try {
      if (!attempt.reply) {
        // A storage failure prevents a new external admission, preserving a safe retry.
        this.ports.onPendingChange?.({ ...attempt.input });
        attempt.reply = await this.ports.send(attempt.input);
        if (this.closed) return;
        this.emit({ type: "conversation-updated" });
      }
      if (this.closed) return;
      this.ports.onPendingChange?.(null);
      this.active = null;
      if (attempt.epoch === this.epoch && !this.queued.length && !this.userSpeaking) {
        this.startPlayback(attempt.reply, attempt.epoch);
      }
      this.drain();
    } catch {
      if (this.closed) return;
      this.active = null;
      this.failed = attempt;
      this.error("The response could not be confirmed. Retry this request; your words and request ID are preserved.", "turn");
      this.refreshState();
    }
  }

  private startPlayback(reply: TurnReply, epoch: number): void {
    if (this.closed || epoch !== this.epoch) return;
    const playback: Playback = { reply, epoch, abort: new AbortController(), started: false };
    this.playback = playback;
    this.refreshState();
    void Promise.resolve().then(async () => {
      if (this.closed || this.playback !== playback || playback.abort.signal.aborted) return;
      await this.ports.speak(reply.message.content, playback.abort.signal, () => {
        if (this.closed || this.playback !== playback || playback.abort.signal.aborted || epoch !== this.epoch) return;
        playback.started = true;
        this.emit({ type: "transcript", id: `advisor:${reply.message.id}`, role: "advisor", text: reply.message.content, final: true });
        this.state("speaking");
      });
      if (this.closed || this.playback !== playback || playback.abort.signal.aborted) return;
      this.playback = null;
      this.refreshState();
    }).catch(() => {
      if (this.closed || this.playback !== playback || playback.abort.signal.aborted || epoch !== this.epoch) return;
      this.playback = null;
      this.playbackRetry = { reply, epoch };
      this.error("The reply is saved, but audio playback failed. Play the reply again or continue speaking.", "playback");
      this.refreshState();
    });
  }
}
