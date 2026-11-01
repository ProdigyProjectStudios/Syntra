export interface NativeStorage { readFile(path: string): Promise<string>; writeFile(path: string, content: string): Promise<void> }
import type {
  Brief,
  BriefChange,
  BriefFields,
  Depth,
  FieldProvenance,
  SessionSummary,
  SpecialistId,
} from './types.ts';
import { BRIEF_KEYS, EMPTY_FIELDS } from './types.ts';
import { ConsultationError, manualBrief, mergeBrief } from './engine.ts';
import { isSpecialistId, normalizeSpecialist } from './specialists.ts';

const RECORD_PATH = 'private/syntra-consultation.json';
const MAX_TURNS = 120;
const MAX_CONTEXT_CHARACTERS = 120000;

interface PendingTurn {
  content: string;
  depth: Depth;
  specialist?: SpecialistId;
  changes: Partial<Record<(typeof BRIEF_KEYS)[number], BriefChange>>;
  responseId?: string;
  createdAt: string;
  baseBrief: Brief;
}

interface SavedTurn {
  requestId: string;
  responseId: string;
  content: string;
  depth: Depth;
  specialist?: SpecialistId;
  createdAt: string;
  reply: string;
}

interface SavedVoiceContext {
  turnId: string;
  depth: Depth;
  createdAt: string;
  /** Supplied only by the trusted native completion hook, never inferred from turnId. */
  responseId?: string;
}

interface SyntraRecord {
  version: 1;
  createdAt: string;
  updatedAt: string;
  depth: Depth;
  title: string;
  brief: Brief;
  turns: SavedTurn[];
  pendingTurns: Record<string, PendingTurn>;
  voiceTurnIds: string[];
  voiceMessages: string[];
  voiceContexts?: SavedVoiceContext[];
  pendingVoice?: Record<string, { content: string; depth?: Depth; createdAt?: string; changes: Partial<Record<(typeof BRIEF_KEYS)[number], BriefChange>>; baseBrief: Brief }>;
}

export interface SessionSnapshot {
  id: 1;
  title: string;
  depth: Depth;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  brief: Brief;
  turns: Array<{ requestId: string; responseId: string; depth: Depth; createdAt: string; specialist?: SpecialistId }>;
}

const locks = new Map<string, Promise<void>>();
export type NativeSessionGate = <T>(sessionKey: string, work: () => Promise<T>) => Promise<T>;

async function withSessionLock<T>(sessionKey: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(sessionKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  locks.set(sessionKey, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(sessionKey) === queued) locks.delete(sessionKey);
  }
}

function emptyRecord(): SyntraRecord {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    depth: 'detailed',
    title: 'New session',
    brief: { ...EMPTY_FIELDS, revision: 0, provenance: {} },
    turns: [],
    pendingTurns: {},
    voiceTurnIds: [],
    voiceMessages: [],
  };
}

function isDepth(value: unknown): value is Depth {
  return value === 'concise' || value === 'detailed' || value === 'deep_dive';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function validVoiceMetadata(candidate: Partial<SyntraRecord>): boolean {
  if (candidate.voiceContexts !== undefined) {
    if (!Array.isArray(candidate.voiceContexts) || !candidate.voiceContexts.every(context =>
      isPlainRecord(context) && typeof context.turnId === 'string' && !!context.turnId.trim() &&
      isDepth(context.depth) && isTimestamp(context.createdAt) &&
      (context.responseId === undefined || (typeof context.responseId === 'string' && !!context.responseId.trim())))) return false;
    if (new Set(candidate.voiceContexts.map(context => context.turnId)).size !== candidate.voiceContexts.length) return false;
    if (candidate.voiceContexts.some(context => !candidate.voiceTurnIds?.includes(context.turnId))) return false;
  }
  if (candidate.pendingVoice !== undefined) {
    if (!isPlainRecord(candidate.pendingVoice)) return false;
    for (const pending of Object.values(candidate.pendingVoice)) {
      if (!isPlainRecord(pending) || typeof pending.content !== 'string' || !isPlainRecord(pending.changes) ||
          (pending.depth !== undefined && !isDepth(pending.depth)) ||
          (pending.createdAt !== undefined && !isTimestamp(pending.createdAt))) return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is SyntraRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<SyntraRecord>;
  return (
    candidate.version === 1 &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    isDepth(candidate.depth) &&
    typeof candidate.title === 'string' &&
    !!candidate.brief &&
    Array.isArray(candidate.turns) &&
    !!candidate.pendingTurns &&
    Array.isArray(candidate.voiceTurnIds) &&
    validVoiceMetadata(candidate)
  );
}

function titleFor(content: string): string {
  const compact = content.trim().replace(/\s+/g, ' ');
  return compact.length > 56 ? `${compact.slice(0, 53)}…` : compact || 'New session';
}

function assertConversationId(id: number): void {
  if (id !== 1) throw new ConsultationError(404, 'Conversation not found.');
}

export class SyntraConsultationRepository {
  readonly #storage: NativeStorage;
  readonly #sessionKey: string;
  readonly #gate: NativeSessionGate;

  constructor(storage: NativeStorage, sessionKey: string, gate: NativeSessionGate = withSessionLock) {
    this.#storage = storage;
    this.#sessionKey = sessionKey;
    this.#gate = gate;
  }

  async #load(): Promise<SyntraRecord> {
    try {
      const content = await this.#storage.readFile(RECORD_PATH);
      const parsed: unknown = JSON.parse(content);
      if (!isRecord(parsed)) throw new Error('Invalid Syntra consultation record.');
      return {
        ...parsed,
        voiceMessages: Array.isArray(parsed.voiceMessages)
          ? parsed.voiceMessages.filter((text): text is string => typeof text === 'string').slice(-MAX_TURNS)
          : [],
      };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        (error as { name?: unknown }).name === 'StorageFileNotFoundError'
      ) {
        const initial = emptyRecord();
        await this.#save(initial);
        return initial;
      }
      throw error;
    }
  }

  async #save(record: SyntraRecord): Promise<void> {
    record.updatedAt = new Date().toISOString();
    await this.#storage.writeFile(
      RECORD_PATH,
      JSON.stringify(record),
    );
  }

  async getSnapshot(): Promise<SessionSnapshot> {
    const record = await this.#gate(this.#sessionKey, () => this.#load());
    return this.#snapshot(record);
  }

  async ensureSession(depth: Depth = 'detailed'): Promise<SessionSnapshot> {
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      if (record.depth !== depth) {
        record.depth = depth;
        await this.#save(record);
      }
      return this.#snapshot(record);
    });
  }

  async list(): Promise<SessionSummary[]> {
    const record = await this.#gate(this.#sessionKey, () => this.#load());
    const summary = this.#snapshot(record);
    return [
      {
        id: summary.id,
        title: summary.title,
        depth: summary.depth,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        messageCount: summary.messageCount,
      },
    ];
  }

  async get(id: number): Promise<SessionSnapshot> {
    assertConversationId(id);
    return this.getSnapshot();
  }

  async beginTurn(id: number, requestId: string, content: string, depth: Depth, selectedSpecialist?: SpecialistId) {
    assertConversationId(id);
    if (selectedSpecialist !== undefined && !isSpecialistId(selectedSpecialist)) throw new ConsultationError(400, 'Choose a valid consultation specialist.');
    const specialist = normalizeSpecialist(selectedSpecialist);
    const text = content.trim();
    if (!text || text.length > 12000) {
      throw new ConsultationError(400, 'Messages must contain 1–12000 characters.');
    }
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
      throw new ConsultationError(400, 'Invalid request ID.');
    }

    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      const completed = record.turns.find((turn) => turn.requestId === requestId);
      if (completed) {
        if (completed.content !== text || completed.depth !== depth || normalizeSpecialist(completed.specialist) !== specialist) {
          throw new ConsultationError(409, 'This request ID was already used for another turn.');
        }
        return { status: 'completed' as const, responseId: completed.responseId };
      }
      const pending = record.pendingTurns[requestId];
      if (pending) {
        if (pending.content !== text || pending.depth !== depth || normalizeSpecialist(pending.specialist) !== specialist) {
          throw new ConsultationError(409, 'This request ID was already used for another turn.');
        }
        return { status: 'pending' as const, responseId: pending.responseId };
      }
      if (Object.keys(record.pendingTurns).length) {
        throw new ConsultationError(409, 'A native consultation turn is already reserved. Resolve it in Agent controls before starting another.');
      }
      if (Object.keys(record.pendingVoice ?? {}).length) {
        throw new ConsultationError(409, 'Your voice response is still finishing. Wait for it to complete, then retry this message. If it has stopped, resolve the turn in Agent controls.');
      }

      const historyCharacters = record.turns.reduce((sum, turn) => sum + turn.content.length + (turn.reply?.length ?? 0), 0)
        + record.voiceMessages.reduce((sum, text) => sum + text.length, 0);
      if (record.turns.length + record.voiceTurnIds.length >= MAX_TURNS) {
        throw new ConsultationError(422, 'This session is full. Please start a new session.');
      }
      if (historyCharacters + text.length > MAX_CONTEXT_CHARACTERS) {
        throw new ConsultationError(
          422,
          'This session has reached its context limit. Your saved brief is preserved; please start a new session.',
        );
      }

      record.depth = depth;
      record.pendingTurns[requestId] = {
        content: text,
        depth,
        specialist,
        changes: {},
        createdAt: new Date().toISOString(),
        baseBrief: structuredClone(record.brief),
      };
      await this.#save(record);
      return { status: 'reserved' as const, responseId: undefined };
    });
  }

  async attachResponseId(requestId: string, responseId: string): Promise<void> {
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      const pending = record.pendingTurns[requestId];
      if (!pending) {
        const completed = record.turns.find((turn) => turn.requestId === requestId);
        if (completed?.responseId === responseId) return;
        throw new ConsultationError(404, 'Consultation turn not found.');
      }
      if (pending.responseId && pending.responseId !== responseId) {
        throw new ConsultationError(409, 'This turn was already admitted to the native session.');
      }
      pending.responseId = responseId;
      await this.#save(record);
    });
  }

  async stageBriefChanges(
    requestId: string,
    changes: Partial<Record<(typeof BRIEF_KEYS)[number], BriefChange>>,
  ) {
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      const pending = record.pendingTurns[requestId];
      if (!pending) throw new ConsultationError(409, 'No active consultation turn matches this update.');
      const visitorHistory = [...record.turns.map((turn) => turn.content), ...record.voiceMessages, pending.content];
      const candidate = mergeBrief(
        record.brief,
        { reply: '', changes, suggestedNextSteps: [] },
        visitorHistory,
        pending.content,
      );
      // Store only validated, non-no-op changes; the final commit re-merges them against
      // the newest revision so concurrent manual edits always retain precedence.
      const staged: typeof changes = {};
      for (const key of BRIEF_KEYS) {
        if (
          candidate[key] !== record.brief[key] ||
          candidate.provenance[key]?.status !== record.brief.provenance[key]?.status
        ) {
          const change = changes[key];
          if (change) staged[key] = change;
        }
      }
      pending.changes = { ...pending.changes, ...staged };
      await this.#save(record);
      return { brief: candidate, stagedFields: Object.keys(staged), depth: pending.depth, specialist: normalizeSpecialist(pending.specialist) };
    });
  }

  async completeTurn(requestId: string, responseId: string, reply: string, verifiedVisitorText?: string): Promise<Brief> {
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      const completed = record.turns.find((turn) => turn.requestId === requestId);
      if (completed) {
        if (completed.responseId !== responseId) {
          throw new ConsultationError(409, 'This request ID was already completed by another native turn.');
        }
        return record.brief;
      }
      const pending = record.pendingTurns[requestId];
      if (!pending) throw new ConsultationError(404, 'Consultation turn not found.');
      if (verifiedVisitorText !== undefined && pending.content !== verifiedVisitorText.trim()) {
        throw new ConsultationError(409, 'Native visitor text does not match the reserved request.');
      }
      if (!pending.responseId || pending.responseId !== responseId) {
        throw new ConsultationError(409, 'This request ID belongs to a different native response.');
      }

      const visitorHistory = [...record.turns.map((turn) => turn.content), ...record.voiceMessages, pending.content];
      const changes = { ...pending.changes };
      for (const key of BRIEF_KEYS) {
        // Legacy pending turns without a reservation snapshot cannot overwrite any fields.
        if (!pending.baseBrief || pending.baseBrief[key] !== record.brief[key] ||
            JSON.stringify(pending.baseBrief.provenance[key]) !== JSON.stringify(record.brief.provenance[key])) {
          delete changes[key];
        }
      }
      record.brief = mergeBrief(
        record.brief,
        { reply, changes, suggestedNextSteps: [] },
        visitorHistory,
        pending.content,
      );
      record.turns.push({
        requestId,
        responseId,
        content: pending.content,
        depth: pending.depth,
        specialist: normalizeSpecialist(pending.specialist),
        createdAt: pending.createdAt,
        reply,
      });
      if (record.turns.length + record.voiceTurnIds.length === 1) record.title = titleFor(pending.content);
      // beginTurn captured the requested depth. A later preference change must survive completion.
      delete record.pendingTurns[requestId];
      await this.#save(record);
      return record.brief;
    });
  }

  /** Called by the native tool; a canceled/failed voice response must not commit this draft. */
  async stageNativeVoiceChanges(turnId: string, content: string, changes: Partial<Record<(typeof BRIEF_KEYS)[number], BriefChange>>) {
    if (!turnId || !content.trim() || content.length > 12000) throw new ConsultationError(400, 'A stable native voice turn and final visitor transcript are required.');
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      const completedIndex = record.voiceTurnIds.indexOf(turnId);
      if (completedIndex >= 0) {
        if (record.voiceMessages[completedIndex]?.trim() !== content.trim()) {
          throw new ConsultationError(409, 'This voice turn was already completed with another transcript.');
        }
        return { brief: record.brief, depth: record.voiceContexts?.find(turn => turn.turnId === turnId)?.depth ?? record.depth };
      }
      const prior = record.pendingVoice?.[turnId];
      if (prior && prior.content !== content) throw new ConsultationError(409, 'This voice turn is already bound to another transcript.');
      // Repeated tool calls belong to the existing reservation. Keep them resumable,
      // including legacy records with overlapping drafts, but admit no fresh overlap.
      if (!prior) {
        if (Object.keys(record.pendingTurns).length) {
          throw new ConsultationError(409, 'Your text response is still finishing. Wait for it to complete before continuing in voice. If it has stopped, resolve the turn in Agent controls.');
        }
        if (Object.keys(record.pendingVoice ?? {}).length) {
          throw new ConsultationError(409, 'A voice response is still finishing. Wait for it to complete before starting another. If it has stopped, resolve the turn in Agent controls.');
        }
        if (record.turns.length + record.voiceTurnIds.length >= MAX_TURNS ||
            record.voiceMessages.reduce((n, text) => n + text.length, content.length) +
            record.turns.reduce((n, turn) => n + turn.content.length + (turn.reply?.length ?? 0), 0) > MAX_CONTEXT_CHARACTERS) {
          throw new ConsultationError(422, 'This consultation has reached its limit. Start a new native session.');
        }
      }
      record.pendingVoice ??= {};
      record.pendingVoice[turnId] = {
        content, depth: prior?.depth ?? record.depth, createdAt: prior?.createdAt ?? new Date().toISOString(),
        changes: { ...prior?.changes, ...changes },
        baseBrief: prior?.baseBrief ?? structuredClone(record.brief),
      };
      await this.#save(record);
      return { brief: record.brief, depth: record.pendingVoice[turnId].depth! };
    });
  }

  /** Trusted host success hook only. Never invoke from a browser transcript/caption callback. */
  async completeNativeVoiceTurn(turnId: string, verifiedVisitorText?: string, responseId?: string): Promise<Brief> {
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      const completedIndex = record.voiceTurnIds.indexOf(turnId);
      if (completedIndex >= 0) {
        const context = record.voiceContexts?.find(turn => turn.turnId === turnId);
        if ((verifiedVisitorText !== undefined && record.voiceMessages[completedIndex]?.trim() !== verifiedVisitorText.trim()) ||
            (responseId && context?.responseId && context.responseId !== responseId)) {
          throw new ConsultationError(409, 'This voice turn was already completed by another native response.');
        }
        return record.brief;
      }
      const pending = record.pendingVoice?.[turnId];
      if (!pending) throw new ConsultationError(404, 'Native voice draft not found.');
      if (verifiedVisitorText !== undefined && pending.content.trim() !== verifiedVisitorText.trim()) {
        throw new ConsultationError(409, 'Native voice transcript does not match the staged visitor turn.');
      }
      const changes = { ...pending.changes };
      for (const key of BRIEF_KEYS) {
        if (!pending.baseBrief || pending.baseBrief[key] !== record.brief[key] ||
            JSON.stringify(pending.baseBrief.provenance[key]) !== JSON.stringify(record.brief.provenance[key])) delete changes[key];
      }
      record.brief = mergeBrief(record.brief, { reply: '', changes, suggestedNextSteps: [] },
        [...record.turns.map(t => t.content), ...record.voiceMessages, pending.content], pending.content);
      record.voiceTurnIds.push(turnId);
      record.voiceMessages.push(pending.content);
      record.voiceContexts ??= [];
      record.voiceContexts.push({ turnId, depth: pending.depth ?? record.depth,
        createdAt: pending.createdAt ?? new Date().toISOString(), ...(responseId ? { responseId } : {}) });
      if (record.turns.length + record.voiceTurnIds.length === 1) record.title = titleFor(pending.content);
      // Keep receipts for the whole bounded consultation, not a sliding window that admits duplicates.
      delete record.pendingVoice![turnId];
      await this.#save(record);
      return record.brief;
    });
  }

  /** Only a trusted host terminal-failure hook may release a reservation; never a timeout heuristic. */
  async discardTurn(requestId: string, voice = false): Promise<void> {
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      if (voice) delete record.pendingVoice?.[requestId];
      else delete record.pendingTurns[requestId];
      await this.#save(record);
    });
  }

  async updateBrief(id: number, changes: Partial<BriefFields>, revision: number): Promise<Brief> {
    assertConversationId(id);
    return this.#gate(this.#sessionKey, async () => {
      const record = await this.#load();
      record.brief = manualBrief(record.brief, changes, revision);
      await this.#save(record);
      return record.brief;
    });
  }

  #snapshot(record: SyntraRecord): SessionSnapshot {
    return {
      id: 1,
      title: record.title,
      depth: record.depth,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      messageCount: (record.turns.length + record.voiceTurnIds.length) * 2,
      brief: record.brief,
      turns: [
        ...record.turns.map(({ requestId, responseId, depth, createdAt, specialist }) => ({ requestId, responseId, depth, createdAt, specialist: normalizeSpecialist(specialist) })),
        ...(record.voiceContexts ?? []).flatMap(turn => turn.responseId ? [{ requestId: turn.turnId,
          responseId: turn.responseId, depth: turn.depth, createdAt: turn.createdAt, specialist: 'syntra' as const }] : []),
      ],
    };
  }
}

export function blankBrief(): Brief {
  return { ...EMPTY_FIELDS, revision: 0, provenance: {} };
}

export type BriefStatusMap = Partial<Record<(typeof BRIEF_KEYS)[number], FieldProvenance>>;
/** Single-process development/tests only. Production must supply a native atomic gate. */
export { withSessionLock as inProcessNativeGate };
