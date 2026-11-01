import { and, eq, desc, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { withPostgresQueryDeadline } from "./postgres-query-deadline.ts";
import { db, type DatabaseClient, conversationsTable as sessions, messagesTable as messages, briefsTable as briefs, turnsTable } from "@workspace/db";
import {
  BRIEF_KEYS, EMPTY_FIELDS, ConsultationError, manualBrief, mergeBrief, normalizeSpecialist,
  readBlueprintStore, mutateBlueprintStore, evolveBlueprint,
  type Blueprint, type BlueprintMutation, type BlueprintUpdateInput,
  type Brief, type Conversation, type ConversationRepository, type Depth, type Message, type TurnReply,
} from "@workspace/consultation";

const owned = (owner: string, id: number) => and(eq(sessions.id, id), eq(sessions.ownerHash, owner));
const iso = (date: Date) => date.toISOString();
function message(row: typeof messages.$inferSelect): Message {
  return { id: row.id, role: row.role as Message["role"], content: row.content, depth: row.depth as Depth, createdAt: iso(row.createdAt) };
}
function brief(row: typeof briefs.$inferSelect): Brief {
  return { ...Object.fromEntries(BRIEF_KEYS.map(k => [k, row[k]])) as typeof EMPTY_FIELDS, revision: row.revision, provenance: row.provenance };
}
function session(row: typeof sessions.$inferSelect) {
  return { id: row.id, title: row.title, depth: row.depth as Depth, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
const OPENING = "Welcome to Digital Prodigy. I can help you shape a useful first build and keep a working brief as we talk. What are you hoping to make easier or possible?";

type Database = NodePgDatabase<typeof schema>;
export type ConsultationTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function withConsultationTransaction<T>(client: DatabaseClient, work: (transaction: ConsultationTransaction) => Promise<T>): Promise<T> {
  return drizzle(withPostgresQueryDeadline(client), { schema }).transaction(work);
}

/** Nested commitTurn operations become savepoints on the lock-owning transaction. */
export interface BlueprintRepository extends ConversationRepository {
  getBlueprint(owner: string, id: number): Promise<Blueprint>;
  mutateBlueprint(owner: string, id: number, input: BlueprintMutation | BlueprintUpdateInput, kind: 'update' | 'regenerate'): Promise<Blueprint>;
}
export function repositoryForTransaction(transaction: ConsultationTransaction): BlueprintRepository {
  return createRepository(transaction);
}

function createRepository(database: Pick<Database, 'select' | 'insert' | 'update' | 'transaction'>): BlueprintRepository {
  return {
  async list(owner) {
    const rows = await database.select({
      id: sessions.id, title: sessions.title, depth: sessions.depth, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt,
      messageCount: sql<number>`(select count(*)::int from ${messages} where ${messages.conversationId} = ${sessions.id})`,
    }).from(sessions).where(eq(sessions.ownerHash, owner)).orderBy(desc(sessions.updatedAt)).limit(100);
    return rows.map(r => ({ ...r, depth: r.depth as Depth, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) }));
  },
  async create(owner, depth) {
    return database.transaction(async tx => {
      const [s] = await tx.insert(sessions).values({ ownerHash: owner, ownerSessionHash: owner, depth }).returning();
      const [b] = await tx.insert(briefs).values({ conversationId: s.id }).returning();
      const [m] = await tx.insert(messages).values({ conversationId: s.id, role: "advisor", content: OPENING, depth }).returning();
      return { ...session(s), messages: [message(m)], brief: brief(b), blueprint: readBlueprintStore(s.blueprint).document };
    });
  },
  async get(owner, id) {
    const [s] = await database.select().from(sessions).where(owned(owner, id));
    if (!s) return null;
    const ms = await database.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.id);
    const [b] = await database.select().from(briefs).where(eq(briefs.conversationId, id));
    return { ...session(s), messages: ms.map(message), brief: b ? brief(b) : { ...EMPTY_FIELDS, revision: 0, provenance: {} }, blueprint: readBlueprintStore(s.blueprint).document };
  },
  async replay(owner, id, requestId) {
    const [row] = await database.select({ response: turnsTable.response, blueprint: sessions.blueprint }).from(turnsTable)
      .innerJoin(sessions, eq(sessions.id, turnsTable.conversationId))
      .where(and(owned(owner, id), eq(turnsTable.requestId, requestId)));
    if (!row) return null;
    const [latest] = await database.select().from(briefs).where(eq(briefs.conversationId, id));
    // Replay immutable messages, but never replay a stale brief over a newer manual correction.
    return { ...row.response as TurnReply, brief: brief(latest), blueprint: readBlueprintStore(row.blueprint).document };
  },
  async commitTurn(owner, before, input, result) {
    return database.transaction(async tx => {
      const [s] = await tx.select().from(sessions).where(owned(owner, before.id)).for("update");
      if (!s) throw new ConsultationError(404, "Conversation not found");
      const [receipt] = await tx.select().from(turnsTable).where(and(eq(turnsTable.conversationId, s.id), eq(turnsTable.requestId, input.requestId)));
      if (receipt) {
        const original = receipt.response as TurnReply;
        if (original.visitorMessage.content !== input.content || original.visitorMessage.depth !== input.depth || normalizeSpecialist(original.specialist) !== normalizeSpecialist(input.specialist)) throw new ConsultationError(409, "This request ID was already used for a different message or specialist.");
        const [latest] = await tx.select().from(briefs).where(eq(briefs.conversationId, s.id));
        return { ...original, brief: brief(latest), blueprint: readBlueprintStore(s.blueprint).document };
      }
      const [last] = await tx.select().from(messages).where(eq(messages.conversationId, s.id)).orderBy(desc(messages.id)).limit(1);
      if (last?.id !== before.messages.at(-1)?.id) throw new ConsultationError(409, "The conversation changed. Reload it and retry your message.");
      // Lock latest brief, not the pre-LLM snapshot: concurrent manual corrections take priority.
      const [b] = await tx.select().from(briefs).where(eq(briefs.conversationId, s.id)).for("update");
      const current = brief(b);
      const changes = { ...result.changes };
      for (const key of BRIEF_KEYS) {
        if (JSON.stringify(current.provenance[key]) !== JSON.stringify(before.brief.provenance[key]) || current[key] !== before.brief[key]) delete changes[key];
      }
      const merged = mergeBrief(current, { ...result, changes }, [...before.messages.filter(m => m.role === "visitor").map(m => m.content), input.content], input.content);
      const blueprint = readBlueprintStore(s.blueprint);
      blueprint.document = evolveBlueprint(blueprint.document, merged, result.blueprintChanges ?? [], {
        visitorHistory: [...before.messages.filter(m => m.role === 'visitor').map(m => m.content), input.content],
        latest: input.content, specialist: normalizeSpecialist(input.specialist), source: 'specialist',
      });
      const [visitor] = await tx.insert(messages).values({ conversationId: s.id, role: "visitor", content: input.content, depth: input.depth }).returning();
      const [advisor] = await tx.insert(messages).values({ conversationId: s.id, role: "advisor", content: result.reply, depth: input.depth }).returning();
      await tx.update(briefs).set(merged).where(eq(briefs.conversationId, s.id));
      await tx.update(sessions).set({ blueprint, depth: input.depth, ...(result.title ? { title: result.title } : {}) }).where(eq(sessions.id, s.id));
      const reply: TurnReply = { blueprint: blueprint.document, visitorMessage: message(visitor), message: message(advisor), brief: merged, suggestedNextSteps: result.suggestedNextSteps, specialist: normalizeSpecialist(input.specialist) };
      // Blueprint is canonical on the consultation, with its own bounded history.
      // Retry receipts keep the immutable pair; replay attaches the newest document
      // instead of duplicating a potentially large/private Blueprint on every turn.
      const { blueprint: _document, ...receiptReply } = reply;
      await tx.insert(turnsTable).values({ conversationId: s.id, requestId: input.requestId, response: receiptReply });
      return reply;
    });
  },
  async editBrief(owner, id, changes, revision) {
    return database.transaction(async tx => {
      const [s] = await tx.select().from(sessions).where(owned(owner, id)).for("update");
      if (!s) throw new ConsultationError(404, "Conversation not found");
      const [b] = await tx.select().from(briefs).where(eq(briefs.conversationId, id)).for("update");
      const updated = manualBrief(brief(b), changes, revision);
      await tx.update(briefs).set(updated).where(eq(briefs.conversationId, id));
      const blueprint = readBlueprintStore(s.blueprint);
      blueprint.document = evolveBlueprint(blueprint.document, updated, [], { visitorHistory: [], latest: '', source: 'brief' });
      await tx.update(sessions).set({ blueprint, updatedAt: new Date() }).where(eq(sessions.id, id));
      return updated;
    });
  },
  async getBlueprint(owner, id) {
    const [row] = await database.select({ blueprint: sessions.blueprint }).from(sessions).where(owned(owner, id));
    if (!row) throw new ConsultationError(404, 'Conversation not found');
    return readBlueprintStore(row.blueprint).document;
  },
  async mutateBlueprint(owner, id, input, kind) {
    return database.transaction(async tx => {
      const [row] = await tx.select().from(sessions).where(owned(owner, id)).for('update');
      if (!row) throw new ConsultationError(404, 'Conversation not found');
      const [savedBrief] = await tx.select().from(briefs).where(eq(briefs.conversationId, id)).for('update');
      const blueprint = await mutateBlueprintStore(readBlueprintStore(row.blueprint), input, kind, brief(savedBrief));
      await tx.update(sessions).set({ blueprint, updatedAt: new Date() }).where(eq(sessions.id, id));
      return blueprint.document;
    });
  },
  };
}

export const repository = createRepository(db);
