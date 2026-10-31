import { Router, type IRouter } from "express";
import {
  ListServicesResponse, ListContactOptionsResponse, ListConversationsResponse,
  CreateConversationBody, CreateConversationResponse, GetConversationParams, GetConversationResponse,
  SendMessageParams, SendMessageBody, SendMessageResponse, GetBriefParams, GetBriefResponse,
  UpdateBriefParams, UpdateBriefBody, UpdateBriefResponse, CreateVoiceSessionBody, CreateVoiceSessionResponse,
} from "@workspace/api-zod";
import { BRIEF_KEYS, ConsultationError, ConsultationService, type BriefFields } from "@workspace/consultation";
import { SERVICE_AREAS, CONTACT_OPTIONS } from "../lib/advisor-data";
import { replitAI } from "../lib/advisor-ai";
import { repository } from "../lib/consultation-repository";
import { privateSession } from "../middlewares/privacy";

const router: IRouter = Router();
const service = new ConsultationService(repository, replitAI);
router.get("/services", (_req, res) => { res.json(ListServicesResponse.parse(SERVICE_AREAS)); });
router.get("/contact-options", (_req, res) => { res.json(ListContactOptionsResponse.parse(CONTACT_OPTIONS)); });
router.use(privateSession);
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

// Bound costly model work; database locking additionally protects against multiple server instances.
const busy = new Set<string>();
const rate = new Map<string, { count: number; until: number }>();
router.post("/conversations/:id/messages", async (req, res) => {
  const { id } = SendMessageParams.parse(req.params);
  const input = SendMessageBody.safeParse(req.body);
  if (!input.success || !input.data.content.trim()) { res.status(400).json({ error: "Provide a message, a response depth and a valid request ID." }); return; }
  const owner = res.locals.owner as string;
  const key = `${owner}:${id}`;
  if (busy.has(key)) throw new ConsultationError(409, "A response is already being prepared for this session.");
  const replay = await repository.replay(owner, id, input.data.requestId);
  if (replay) {
    if (replay.visitorMessage.content !== input.data.content || replay.visitorMessage.depth !== input.data.depth) throw new ConsultationError(409, "This request ID was already used for a different message.");
    res.json(SendMessageResponse.parse(replay)); return;
  }
  const now = Date.now();
  for (const [k, r] of rate) if (r.until < now) rate.delete(k);
  const limit = rate.get(owner) ?? { count: 0, until: now + 60000 };
  if (limit.count >= 12) { res.setHeader("Retry-After", "60"); throw new ConsultationError(429, "Please wait a minute before sending more messages."); }
  rate.set(owner, { ...limit, count: limit.count + 1 });
  busy.add(key);
  try {
    res.json(SendMessageResponse.parse(await service.send(owner, id, input.data)));
  } finally { busy.delete(key); }
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
router.post("/voice/sessions", async (req, res) => {
  const { conversationId } = CreateVoiceSessionBody.parse(req.body);
  if (!await repository.get(res.locals.owner, conversationId)) throw new ConsultationError(404, "Conversation not found");
  res.json(CreateVoiceSessionResponse.parse({
    id: "unavailable", conversationId, status: "unavailable", transport: "none",
    detail: "Realtime voice is not connected in this development runtime. AgentPlace must supply its native voice adapter.",
  }));
});
export default router;
