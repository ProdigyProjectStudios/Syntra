import type { AgentStorage } from '../agent/agent-library.ts';
import type {
  Brief,
  BriefChange,
  BriefFields,
  Depth,
  FieldProvenance,
  SessionSummary,
} from './consultation-types.ts';
import { BRIEF_KEYS, EMPTY_FIELDS } from './consultation-types.ts';
import { ConsultationError, manualBrief, mergeBrief } from './consultation-engine.ts';

const RECORD_PATH = 'private/syntra-consultation.json';
const MAX_TURNS = 120;
const MAX_CONTEXT_CHARACTERS = 120000;

interface PendingTurn {
  content: string;
  depth: Depth;
  changes: Partial<Record<(typeof BRIEF_KEYS)[number], BriefChange>>;
  responseId?: string;
  createdAt: string;
}

interface SavedTurn {
  requestId: string;
  responseId: string;
  content: string;
  depth: Depth;
  createdAt: string;
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
}

export interface SessionSnapshot {
  id: 1;
  title: string;
  depth: Depth;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  brief: Brief;
  turns: Array<{ responseId: string; depth: Depth }>;
}

const locks = new Map<string, Promise<void>>();

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
    Array.isArray(candidate.voiceTurnIds)
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
  readonly #storage: AgentStorage;
  readonly #sessionKey: string;

  constructor(storage: AgentStorage, sessionKey: string) {
    this.#storage = storage;
    this.#sessionKey = sessionKey;
  }

  async #load(): Promise<SyntraRecord> {
    try {
      const content = await this.#storage.readFile(RECORD_PATH);
      const parsed: unknown = JSON.parse(content.toString('utf8'));
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
      Buffer.from(JSON.stringify(record), 'utf8'),
    );
  }

  async getSnapshot(): Promise<SessionSnapshot> {
    const record = await withSessionLock(this.#sessionKey, () => this.#load());
    return this.#snapshot(record);
  }

  async ensureSession(depth: Depth = 'detailed'): Promise<SessionSnapshot> {
    return withSessionLock(this.#sessionKey, async () => {
      const record = await this.#load();
      if (record.depth !== depth) {
        record.depth = depth;
        await this.#save(record);
      }
      return this.#snapshot(record);
    });
  }

  async list(): Promise<SessionSummary[]> {
    const record = await withSessionLock(this.#sessionKey, () => this.#load());
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

  async beginTurn(id: number, requestId: string, content: string, depth: Depth) {
    assertConversationId(id);
    const text = content.trim();
    if (!text || text.length > 12000) {
      throw new ConsultationError(400, 'Messages must contain 1–12000 characters.');
    }
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
      throw new ConsultationError(400, 'Invalid request ID.');
    }

    return withSessionLock(this.#sessionKey, async () => {
      const record = await this.#load();
      const completed = record.turns.find((turn) => turn.requestId === requestId);
      if (completed) {
        if (completed.content !== text || completed.depth !== depth) {
          throw new ConsultationError(409, 'This request ID was already used for another turn.');
        }
        return { status: 'completed' as const, responseId: completed.responseId };
      }
      const pending = record.pendingTurns[requestId];
      if (pending) {
        if (pending.content !== text || pending.depth !== depth) {
          throw new ConsultationError(409, 'This request ID was already used for another turn.');
        }
        return { status: 'pending' as const, responseId: pending.responseId };
      }

      const historyCharacters = record.turns.reduce((sum, turn) => sum + turn.content.length, 0);
      if (record.turns.length >= MAX_TURNS) {
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
        changes: {},
        createdAt: new Date().toISOString(),
      };
      await this.#save(record);
      return { status: 'pending' as const, responseId: undefined };
    });
  }

  async attachResponseId(requestId: string, responseId: string): Promise<void> {
    return withSessionLock(this.#sessionKey, async () => {
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
    return withSessionLock(this.#sessionKey, async () => {
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
      return { brief: candidate, stagedFields: Object.keys(staged), depth: pending.depth };
    });
  }

  async completeTurn(requestId: string, responseId: string, reply: string): Promise<Brief> {
    return withSessionLock(this.#sessionKey, async () => {
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
      if (pending.responseId && pending.responseId !== responseId) {
        throw new ConsultationError(409, 'This request ID belongs to a different native response.');
      }

      const visitorHistory = [...record.turns.map((turn) => turn.content), ...record.voiceMessages, pending.content];
      record.brief = mergeBrief(
        record.brief,
        { reply, changes: pending.changes, suggestedNextSteps: [] },
        visitorHistory,
        pending.content,
      );
      record.turns.push({
        requestId,
        responseId,
        content: pending.content,
        depth: pending.depth,
        createdAt: pending.createdAt,
      });
      if (record.turns.length === 1) record.title = titleFor(pending.content);
      record.depth = pending.depth;
      delete record.pendingTurns[requestId];
      await this.#save(record);
      return record.brief;
    });
  }

  async mergeNativeVoiceChanges(
    turnId: string,
    content: string,
    changes: Partial<Record<(typeof BRIEF_KEYS)[number], BriefChange>>,
  ): Promise<{ brief: Brief; changedFields: string[]; depth: Depth }> {
    const text = content.trim();
    if (!text) throw new ConsultationError(400, 'The current visitor transcript is unavailable.');
    return withSessionLock(this.#sessionKey, async () => {
      const record = await this.#load();
      if (record.voiceTurnIds.includes(turnId)) return { brief: record.brief, changedFields: [], depth: record.depth };
      const before = record.brief;
      const visitorHistory = [...record.turns.map((turn) => turn.content), ...record.voiceMessages, text];
      const next = mergeBrief(
        before,
        { reply: '', changes, suggestedNextSteps: [] },
        visitorHistory,
        text,
      );
      const changedFields = BRIEF_KEYS.filter((key) =>
        before[key] !== next[key] || before.provenance[key]?.status !== next.provenance[key]?.status,
      );
      record.brief = next;
      record.voiceMessages.push(text);
      if (record.voiceMessages.length > MAX_TURNS) record.voiceMessages.shift();
      record.voiceTurnIds.push(turnId);
      if (record.voiceTurnIds.length > MAX_TURNS) record.voiceTurnIds.shift();
      await this.#save(record);
      return { brief: record.brief, changedFields, depth: record.depth };
    });
  }

  async updateBrief(id: number, changes: Partial<BriefFields>, revision: number): Promise<Brief> {
    assertConversationId(id);
    return withSessionLock(this.#sessionKey, async () => {
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
      messageCount: record.turns.length * 2,
      brief: record.brief,
      turns: record.turns.map(({ responseId, depth }) => ({ responseId, depth })),
    };
  }
}

export function blankBrief(): Brief {
  return { ...EMPTY_FIELDS, revision: 0, provenance: {} };
}

export type BriefStatusMap = Partial<Record<(typeof BRIEF_KEYS)[number], FieldProvenance>>;
