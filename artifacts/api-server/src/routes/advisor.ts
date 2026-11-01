import { Router, type IRouter } from "express";
import {
  ListServicesResponse, ListContactOptionsResponse, ListConversationsResponse,
  CreateConversationBody, CreateConversationResponse, GetConversationParams, GetConversationResponse,
  SendMessageParams, SendMessageBody, SendMessageResponse, GetBriefParams, GetBriefResponse,
  UpdateBriefParams, UpdateBriefBody, UpdateBriefResponse, CreateVoiceSessionBody, CreateVoiceSessionResponse,
} from "@workspace/api-zod";
import { BRIEF_KEYS, ConsultationError, ConsultationService, normalizeSpecialist, type BriefFields } from "@workspace/consultation";
import { SERVICE_AREAS, CONTACT_OPTIONS } from "../lib/advisor-data";
import { replitAI } from "../lib/advisor-ai";
import { repository, repositoryForTransaction, withConsultationTransaction, type ConsultationTransaction } from "../lib/consultation-repository";
import { pool, type DatabaseClient } from "@workspace/db";
import { createPostgresConversationAdmissionGate } from "../lib/postgres-admission";
import { issueSpeechToken, speechConfiguration } from "../lib/speech-provider";

const router: IRouter = Router();
router.get("/services", (_req, res) => { res.json(ListServicesResponse.parse(SERVICE_AREAS)); });
router.get("/contact-options", (_req, res) => { res.json(ListContactOptionsResponse.parse(CONTACT_OPTIONS)); });
router.get("/voice/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(speechConfiguration());
});
router.get("/conversations", async (_req, res) => {
  res.json(ListConversationsResponse.parse(await repository.list(res.locals.owner)));
});
router.post("/conversations", async (req, res) => {
  const input = CreateConversationBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Choose a valid response depth." }); return; }
  res.status(201).json(CreateConversationResponse.parse(await repository.create(res.locals.owner, input.data.depth)));
});
router.get("/conversations/:id", async (req, res) => {
  const { id } = GetConversationParams.parse(req.params);
  const conversation = await repository.get(res.locals.owner, id);
  if (!conversation) throw new ConsultationError(404, "Conversation not found");
  res.json(GetConversationResponse.parse(conversation));
});

// Hold a PostgreSQL transaction advisory lock through model generation and receipt commit,
// so autoscaled workers share the same admission boundary. No schema migration is needed.
const admission = createPostgresConversationAdmissionGate<DatabaseClient, ConsultationTransaction>(pool, withConsultationTransaction);
const rate = new Map<string, { count: number; until: number }>();
router.post("/conversations/:id/messages", async (req, res) => {
  const { id } = SendMessageParams.parse(req.params);
  const input = SendMessageBody.safeParse(req.body);
  if (!input.success || !input.data.content.trim()) { res.status(400).json({ error: "Provide a message, a response depth and a valid request ID." }); return; }
  const owner = res.locals.owner as string;
  const key = `${owner}:${id}`;
  // Claim before any asynchronous receipt lookup: two requests can otherwise
  // both observe an idle session and enter the model after their lookups settle.
  const reply = await admission.run(key, async transaction => {
    const turnRepository = repositoryForTransaction(transaction);
    const service = new ConsultationService(turnRepository, replitAI);
    const replay = await turnRepository.replay(owner, id, input.data.requestId);
    if (replay) {
      if (replay.visitorMessage.content !== input.data.content || replay.visitorMessage.depth !== input.data.depth || normalizeSpecialist(replay.specialist) !== normalizeSpecialist(input.data.specialist)) throw new ConsultationError(409, "This request ID was already used for a different message.");
      return SendMessageResponse.parse(replay);
    }
    const now = Date.now();
    for (const [k, r] of rate) if (r.until < now) rate.delete(k);
    const limit = rate.get(owner) ?? { count: 0, until: now + 60000 };
    if (limit.count >= 12) { res.setHeader("Retry-After", "60"); throw new ConsultationError(429, "Please wait a minute before sending more messages."); }
    rate.set(owner, { ...limit, count: limit.count + 1 });
    return SendMessageResponse.parse(await service.send(owner, id, input.data));
  });
  res.json(reply);
});
router.get("/conversations/:id/brief", async (req, res) => {
  const { id } = GetBriefParams.parse(req.params);
  const conversation = await repository.get(res.locals.owner, id);
  if (!conversation) throw new ConsultationError(404, "Conversation not found");
  res.json(GetBriefResponse.parse(conversation.brief));
});
router.patch("/conversations/:id/brief", async (req, res) => {
  const { id } = UpdateBriefParams.parse(req.params);
  const input = UpdateBriefBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "A brief revision and valid fields are required." }); return; }
  const changes: Partial<BriefFields> = {};
  for (const key of BRIEF_KEYS) {
    const value = input.data[key];
    if (typeof value === "string" && value.length > 4000) throw new ConsultationError(400, "Brief fields must be at most 4000 characters.");
    if (value !== undefined) changes[key] = value;
  }
  if (!Object.keys(changes).length) throw new ConsultationError(400, "No brief fields supplied.");
  res.json(UpdateBriefResponse.parse(await repository.editBrief(res.locals.owner, id, changes, input.data.revision)));
});
router.get("/conversations/:id/blueprint", async (req, res) => {
  const { id } = GetConversationParams.parse(req.params);
  res.json(await repository.getBlueprint(res.locals.owner, id));
});
router.patch("/conversations/:id/blueprint", async (req, res) => {
  const { id } = GetConversationParams.parse(req.params);
  const owner = res.locals.owner as string;
  res.json(await repository.mutateBlueprint(owner, id, req.body, 'update'));
});
router.post("/conversations/:id/blueprint/regenerate", async (req, res) => {
  const { id } = GetConversationParams.parse(req.params);
  const owner = res.locals.owner as string;
  res.json(await repository.mutateBlueprint(owner, id, req.body, 'regenerate'));
});
router.post("/voice/sessions", async (req, res) => {
  const { conversationId } = CreateVoiceSessionBody.parse(req.body);
  if (!await repository.get(res.locals.owner, conversationId)) throw new ConsultationError(404, "Conversation not found");
  res.json(CreateVoiceSessionResponse.parse({
    id: "unavailable", conversationId, status: "unavailable", transport: "none",
    detail: "This legacy endpoint does not provision native voice sessions. Use the configured development speech adapter here, or AgentPlace's native voice adapter in its host.",
  }));
});
router.post("/voice/token", async (req, res) => {
  if (!req.is("application/json") || req.get("X-Syntra-Voice") !== "1") throw new ConsultationError(400, "A voice connection request is required.");
  const id = req.body?.conversationId;
  if (!Number.isSafeInteger(id) || id <= 0) throw new ConsultationError(400, "Choose a valid consultation.");
  if (!await repository.get(res.locals.owner, id)) throw new ConsultationError(404, "Conversation not found");
  // No long-lived key, transcript, or personal brief data appears in the response or logs.
  res.json(await issueSpeechToken(res.locals.owner));
});
export default router;
