interface RecognitionResultIdentity {
  resultId: string;
  offset?: number;
  duration?: number;
}
type Span = { start: number; end: number };
type Utterance = { id: string; sequence: number; provider: string; span?: Span; hypotheses: Span[] };
export interface RecognitionIdentity {
  id: string;
  /** Connection-local counters only. Provider IDs stay inside this mapper. */
  sequence: number;
  duplicate: boolean;
  ambiguous: boolean;
  timingAvailable: boolean;
  reusedProviderId: boolean;
}

function spanOf(result: RecognitionResultIdentity): Span | undefined {
  const { offset, duration } = result;
  if (offset === undefined || duration === undefined || !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(duration) || offset < 0 || duration < 0 ||
      !Number.isSafeInteger(offset + duration)) return;
  // An untimed NoMatch commonly has 0/0. It cannot identify a position in audio.
  if (offset === 0 && duration === 0) return;
  return { start: offset, end: offset + duration };
}
const overlaps = (a: Span, b: Span) => a.start === b.start || (a.start < b.end && b.start < a.end);
const includes = (a: Span, b: Span) => a.start <= b.start && a.end >= b.end && (b.start < a.end || a.start === b.start);

/**
 * Azure JS resultId identifies a service request, which may contain many phrases.
 * Final audio spans deduplicate delivery; local IDs correlate mutable hypotheses
 * with their final. Never key a hypothesis by its offset: Azure may refine it.
 */
export class RecognitionIdentityTracker {
  private sequence = 0;
  private pending: Utterance[] = [];
  private completed: Utterance[] = [];
  private providers = new Set<string>();
  private speechBoundary = false;
  private readonly epoch: number;

  constructor(epoch: number) { this.epoch = epoch; }

  speechStarted() { this.speechBoundary = true; }
  get awaitingFinal() { return this.pending.length > 0; }

  interim(result: RecognitionResultIdentity): RecognitionIdentity {
    const span = spanOf(result);
    const duplicate = this.completed.find(item => item.provider === result.resultId &&
      (span && item.span ? includes(item.span, span) ||
        item.hypotheses.some(previous => previous.start === span.start && previous.end === span.end)
        : !span && !item.span && !this.speechBoundary));
    if (duplicate) return this.selection(duplicate, true, Boolean(span));
    const utterance = this.match(result, span) ?? this.create(result.resultId, span);
    utterance.span = span ?? utterance.span;
    if (span) {
      utterance.hypotheses.push(span);
      if (utterance.hypotheses.length > 32) utterance.hypotheses.shift();
    }
    this.speechBoundary = false;
    return this.selection(utterance, false, Boolean(span));
  }

  terminal(result: RecognitionResultIdentity): RecognitionIdentity {
    const span = spanOf(result);
    const pending = this.match(result, span, true);
    // An untimed terminal reused after an earlier untimed result cannot prove
    // which live hypothesis ended. Ask the adapter to retire this epoch safely.
    const untimedPrevious = !span && this.completed.find(item => item.provider === result.resultId && !item.span);
    if (untimedPrevious && (pending || this.speechBoundary)) {
      return { ...this.selection(pending ?? untimedPrevious, false, false), ambiguous: true };
    }
    const duplicate = this.completed.find(item => item.provider === result.resultId &&
      (span && item.span ? item.span.start === span.start && item.span.end === span.end
        : !span && !item.span && !pending && !this.speechBoundary));
    if (duplicate) return this.selection(duplicate, true, Boolean(span));
    const utterance = pending ?? this.create(result.resultId, span);
    this.pending = this.pending.filter(item => item !== utterance);
    utterance.span = span;
    this.completed.push(utterance);
    if (this.completed.length > 512) this.completed.shift();
    this.speechBoundary = false;
    return this.selection(utterance, false, Boolean(span));
  }

  private match(result: RecognitionResultIdentity, span: Span | undefined, terminal = false): Utterance | undefined {
    const candidates = this.pending.filter(item => item.provider === result.resultId);
    if (!span) return candidates.at(-1);
    const matches = candidates.filter(item => !item.span || overlaps(item.span, span));
    // A delayed older final can overlap a newer hypothesis after refinement.
    // Match its closest start, rather than unconditionally consuming the latest.
    const overlapping = terminal
      ? matches.sort((a, b) => Math.abs((a.span?.start ?? span.start) - span.start) - Math.abs((b.span?.start ?? span.start) - span.start))[0]
      : matches.at(-1);
    if (overlapping) return overlapping;
    // A final can refine its start beyond a short hypothesis. Keep its local ID
    // unless timing proves this is an older result or a new speech boundary.
    const latest = candidates.at(-1);
    if (latest && !this.speechBoundary && (!latest.span || span.end > latest.span.start)) return latest;
    return undefined;
  }

  private create(provider: string, span: Span | undefined): Utterance {
    const sequence = ++this.sequence;
    const utterance: Utterance = { id: `azure:${this.epoch}:${sequence}`, sequence, provider, span, hypotheses: [] };
    this.pending.push(utterance);
    if (this.pending.length > 32) this.pending.shift();
    return utterance;
  }

  private selection(utterance: Utterance, duplicate: boolean, timingAvailable: boolean): RecognitionIdentity {
    const reusedProviderId = this.providers.has(utterance.provider) &&
      this.completed.some(item => item.provider === utterance.provider && item !== utterance);
    this.providers.add(utterance.provider);
    if (this.providers.size > 512) this.providers.delete(this.providers.values().next().value!);
    return { id: utterance.id, sequence: utterance.sequence, duplicate, ambiguous: false, timingAvailable, reusedProviderId };
  }
}
