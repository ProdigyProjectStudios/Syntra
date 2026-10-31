import type { VoiceConnection, VoiceEvent } from '@workspace/consultation';

type VoiceFailure = Omit<Extract<VoiceEvent, { type: 'error' }>, 'type'>;

/** A rejected phrase/local notice can coexist with another accepted turn playing. */
export function isLocalVoiceNotice(failure: VoiceFailure): boolean {
  return failure.recoverable === true && failure.retryable === false && !failure.recovery;
}

/** A released transport cannot service its former retry or microphone controls. */
export function reconnectFailure(previous?: VoiceFailure | null): VoiceFailure {
  return {
    message: previous?.message ?? 'The voice connection closed. Reconnect when you are ready.',
    recoverable: true,
    retryable: true,
  };
}

/** Own one connection attempt, including a handle that arrives after it has ended. */
export class VoiceConnectionLifecycle {
  private readonly signal: AbortSignal;
  private readonly onCloseError?: () => void;
  private readonly released = new WeakSet<VoiceConnection>();
  private current: VoiceConnection | null = null;
  private terminal = false;
  private disposed = false;
  private releaseFailed = false;

  constructor(signal: AbortSignal, onCloseError?: () => void) {
    this.signal = signal;
    this.onCloseError = onCloseError;
  }

  get connection() { return this.current; }
  get closed() { return this.terminal || this.disposed || this.signal.aborted; }
  get closeFailed() { return this.releaseFailed; }

  admitEvent(event: VoiceEvent): boolean {
    if (this.disposed || this.signal.aborted) return false;
    // A terminal provider error can follow its closed event. Captions, amplitude
    // and state updates from the released stream must never revive it.
    if (this.terminal) return event.type === 'error';
    if (event.type === 'state' && event.state === 'closed') this.terminate();
    return true;
  }

  attach(connection: VoiceConnection): boolean {
    if (this.closed || (this.current && this.current !== connection)) {
      this.release(connection);
      return false;
    }
    this.current = connection;
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.terminate();
  }

  private terminate(): void {
    this.terminal = true;
    // Invoke release before dropping ownership, even if close throws synchronously.
    if (this.current) this.release(this.current);
    this.current = null;
  }

  private release(connection: VoiceConnection): void {
    if (this.released.has(connection)) return;
    this.released.add(connection);
    const failed = () => {
      this.releaseFailed = true;
      if (!this.disposed && !this.signal.aborted) this.onCloseError?.();
    };
    try { void Promise.resolve(connection.close()).catch(failed); }
    catch { failed(); }
  }
}
