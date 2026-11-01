import { Router, type IRouter } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { db, conversationsTable, messagesTable, briefsTable } from "@workspace/db";
import {
  ListServicesResponse,
  ListContactOptionsResponse,
  ListConversationsResponse,
  CreateConversationBody,
  CreateConversationResponse,
  GetConversationParams,
  GetConversationResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
  GetBriefParams,
  GetBriefResponse,
  UpdateBriefParams,
  UpdateBriefBody,
  UpdateBriefResponse,
  CreateVoiceSessionBody,
  CreateVoiceSessionResponse,
} from "@workspace/api-zod";
import { SERVICE_AREAS, CONTACT_OPTIONS } from "../lib/advisor-data";
import { runAdvisor, type BriefFields, type Depth } from "../lib/advisor-ai";

const router: IRouter = Router();

const EMPTY_BRIEF: BriefFields = {
  objective: null,
  service: null,
  proposedSolution: null,
  requirements: null,
  integrations: null,
  budget: null,
  timeline: null,
  nextStep: null,
};

const OPENING_MESSAGE =
  "Welcome to Digital Prodigy. I can help you work out what to build, which service direction fits, and what a useful first release might include. You can describe the problem in your own words — you don't need a polished spec or budget to start. What are you hoping to make easier or possible?";

type BriefRowShape = typeof briefsTable.$inferSelect;

function briefToFields(brief: BriefRowShape | undefined): BriefFields {
  if (!brief) return { ...EMPTY_BRIEF };
  return {
    objective: brief.objective,
    service: brief.service,
    proposedSolution: brief.proposedSolution,
    requirements: brief.requirements,
    integrations: brief.integrations,
    budget: brief.budget,
    timeline: brief.timeline,
    nextStep: brief.nextStep,
  };
}

async function loadConversation(id: number, ownerSessionHash: string) {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, id), eq(conversationsTable.ownerSessionHash, ownerSessionHash)));
  if (!conversation) return null;

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(messagesTable.createdAt, messagesTable.id);

  const [brief] = await db
    .select()
    .from(briefsTable)
    .where(eq(briefsTable.conversationId, id));

  return { conversation, messages, brief };
}

router.get("/services", async (_req, res): Promise<void> => {
  res.json(ListServicesResponse.parse(SERVICE_AREAS));
});

router.get("/contact-options", async (_req, res): Promise<void> => {
  res.json(ListContactOptionsResponse.parse(CONTACT_OPTIONS));
});

router.get("/conversations", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: conversationsTable.id,
      title: conversationsTable.title,
      depth: conversationsTable.depth,
      createdAt: conversationsTable.createdAt,
      updatedAt: conversationsTable.updatedAt,
      messageCount: sql<number>`(select count(*)::int from ${messagesTable} where ${messagesTable.conversationId} = ${conversationsTable.id})`,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.ownerSessionHash, res.locals.visitorSessionHash as string))
    .orderBy(desc(conversationsTable.updatedAt));

  res.json(ListConversationsResponse.parse(rows));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conversation] = await db
    .insert(conversationsTable)
    .values({ depth: parsed.data.depth, ownerSessionHash: res.locals.visitorSessionHash as string })
    .returning();

  await db.insert(briefsTable).values({ conversationId: conversation.id });

  const [opening] = await db
    .insert(messagesTable)
    .values({
      conversationId: conversation.id,
      role: "advisor",
      content: OPENING_MESSAGE,
      depth: parsed.data.depth,
    })
    .returning();

  res.status(201).json(
    CreateConversationResponse.parse({
      ...conversation,
      messages: [opening],
      brief: { ...EMPTY_BRIEF },
    }),
  );
});

router.get("/conversations/:id", async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const loaded = await loadConversation(params.data.id, res.locals.visitorSessionHash as string);
  if (!loaded) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(
    GetConversationResponse.parse({
      ...loaded.conversation,
      messages: loaded.messages,
      brief: briefToFields(loaded.brief),
    }),
  );
});

router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const loaded = await loadConversation(params.data.id, res.locals.visitorSessionHash as string);
  if (!loaded) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const history = loaded.messages.map((m) => ({
    role: m.role as "visitor" | "advisor",
    content: m.content,
  }));
  const isFirstMessage = !loaded.messages.some((m) => m.role === "visitor");

  await db.insert(messagesTable).values({
    conversationId: loaded.conversation.id,
    role: "visitor",
    content: parsed.data.content,
    depth: parsed.data.depth,
  });

  history.push({ role: "visitor", content: parsed.data.content });

  const result = await runAdvisor({
    history,
    currentBrief: briefToFields(loaded.brief),
    depth: parsed.data.depth as Depth,
    isFirstMessage,
  });

  const [advisorMessage] = await db
    .insert(messagesTable)
    .values({
      conversationId: loaded.conversation.id,
      role: "advisor",
      content: result.reply,
      depth: parsed.data.depth,
    })
    .returning();

  if (Object.keys(result.brief).length > 0) {
    await db
      .update(briefsTable)
      .set(result.brief)
      .where(eq(briefsTable.conversationId, loaded.conversation.id));
  }

  await db
    .update(conversationsTable)
    .set({
      depth: parsed.data.depth,
      ...(result.title ? { title: result.title } : {}),
    })
    .where(eq(conversationsTable.id, loaded.conversation.id));

  const [updatedBrief] = await db
    .select()
    .from(briefsTable)
    .where(eq(briefsTable.conversationId, loaded.conversation.id));

  res.json(
    SendMessageResponse.parse({
      message: advisorMessage,
      brief: briefToFields(updatedBrief),
      suggestedNextSteps: result.suggestedNextSteps,
    }),
  );
});

router.get("/conversations/:id/brief", async (req, res): Promise<void> => {
  const params = GetBriefParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const loaded = await loadConversation(params.data.id, res.locals.visitorSessionHash as string);
  if (!loaded || !loaded.brief) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(GetBriefResponse.parse(briefToFields(loaded.brief)));
});

router.patch("/conversations/:id/brief", async (req, res): Promise<void> => {
  const params = UpdateBriefParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBriefBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  const loaded = await loadConversation(params.data.id, res.locals.visitorSessionHash as string);
  if (!loaded) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [updated] = await db
    .update(briefsTable)
    .set(updates)
    .where(eq(briefsTable.conversationId, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(UpdateBriefResponse.parse(briefToFields(updated)));
});

router.post("/voice/sessions", async (req, res): Promise<void> => {
  const parsed = CreateVoiceSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, parsed.data.conversationId), eq(conversationsTable.ownerSessionHash, res.locals.visitorSessionHash as string)));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  req.log.info(
    { conversationId: conversation.id },
    "Voice session provisioned",
  );

  res.status(201).json(
    CreateVoiceSessionResponse.parse({
      id: crypto.randomUUID(),
      status: "provisioned",
      conversationId: conversation.id,
      transport: "webrtc",
      detail:
        "Real-time voice channel reserved for this conversation. The advisor will speak and listen here once the voice transport connects.",
    }),
  );
});

export default router;
