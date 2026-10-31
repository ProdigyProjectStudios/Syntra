import assert from "node:assert/strict";
import { test } from "node:test";
import { SyntraConsultationRepository, blankBrief, type NativeStorage } from "./native-repository.ts";
import { createNativeRuntime, type NativePorts } from "./native-runtime.ts";
import { NativeTranscript, type NativeTranscriptPart } from "./native-transcript.ts";
import { verifyNativeCompletion } from "./native-completion.ts";
import { manualBrief } from "./engine.ts";
import type { Conversation, Message } from "./types.ts";

class Memory implements NativeStorage {
  files = new Map<string, string>();
  async readFile(path: string) {
    if (!this.files.has(path)) throw Object.assign(new Error("Missing"), { name: "StorageFileNotFoundError" });
    return this.files.get(path)!;
  }
  async writeFile(path: string, value: string) { this.files.set(path, value); }
}
const change = { value: "£6000", status: "confirmed" as const, evidence: "Budget £6000" };
const reserve = async (scope: string) => {
  const storage = new Memory();
  const repo = new SyntraConsultationRepository(storage, scope);
  await repo.ensureSession();
  await repo.beginTurn(1, "request_native_1", "Budget £6000", "deep_dive");
  return { storage, repo };
};
test("native reservation has exactly one sender across simultaneous clients", async () => {
  const repo = new SyntraConsultationRepository(new Memory(), "admissions");
  const args = [1, "native_request_1", "I need a portal", "detailed"] as const;
  const admissions = await Promise.all([repo.beginTurn(...args), repo.beginTurn(...args), repo.beginTurn(...args)]);
  assert.deepEqual(admissions.map(a => a.status), ["reserved", "pending", "pending"]);
  await assert.rejects(repo.beginTurn(1, "native_request_2", "Another message", "detailed"), { status: 409 });
  await assert.rejects(repo.beginTurn(1, "native_request_1", "Changed text", "detailed"), { status: 409 });
});
test("native completion requires an attached response and matching canonical visitor text", async () => {
  const { repo } = await reserve("canonical");
  await assert.rejects(repo.completeTurn("request_native_1", "response1", "Done"), { status: 409 });
  await repo.attachResponseId("request_native_1", "response1");
  await assert.rejects(repo.completeTurn("request_native_1", "response2", "Done"), { status: 409 });
  await assert.rejects(repo.completeTurn("request_native_1", "response1", "Done", "Someone else's turn"), { status: 409 });
});
test("manual edit during native generation wins even over an explicit staged correction", async () => {
  const { repo } = await reserve("manual-race");
  await repo.attachResponseId("request_native_1", "response1");
  await repo.stageBriefChanges("request_native_1", { budget: change });
  const edited = await repo.updateBrief(1, { budget: "£7000" }, 0);
  const completed = await repo.completeTurn("request_native_1", "response1", "Done", "Budget £6000");
  assert.deepEqual(completed, edited);
  const cleared = await repo.updateBrief(1, { budget: null }, completed.revision);
  assert.deepEqual(await repo.completeTurn("request_native_1", "response1", "Done"), cleared);
});
test("native restart restores depth, provenance, receipts and latest brief", async () => {
  const { storage, repo } = await reserve("reload");
  await repo.attachResponseId("request_native_1", "response1");
  await repo.stageBriefChanges("request_native_1", { budget: change });
  await repo.completeTurn("request_native_1", "response1", "What should the portal do?");
  const restarted = new SyntraConsultationRepository(storage, "reload");
  const snapshot = await restarted.get(1);
  assert.equal(snapshot.depth, "deep_dive");
  assert.equal(snapshot.brief.budget, "£6000");
  assert.equal(snapshot.brief.provenance.budget?.status, "confirmed");
  assert.equal((await restarted.beginTurn(1, "request_native_1", "Budget £6000", "deep_dive")).status, "completed");
});
test("voice drafts are not committed on tool execution or cancellation", async () => {
  const repo = new SyntraConsultationRepository(new Memory(), "voice-cancel");
  await repo.stageNativeVoiceChanges("voice1", "Budget £6000", { budget: change });
  assert.equal((await repo.get(1)).brief.budget, null);
  await repo.discardTurn("voice1", true);
  await assert.rejects(repo.completeNativeVoiceTurn("voice1"), { status: 404 });
});
test("voice finalization deduplicates by native turn, not individual tool call", async () => {
  const repo = new SyntraConsultationRepository(new Memory(), "voice-dedupe");
  await repo.stageNativeVoiceChanges("voice1", "Budget £6000", {});
  await repo.stageNativeVoiceChanges("voice1", "Budget £6000", { budget: change });
  const result = await repo.completeNativeVoiceTurn("voice1");
  assert.equal(result.budget, "£6000");
  assert.deepEqual(await repo.completeNativeVoiceTurn("voice1"), result);
  assert.equal((await repo.get(1)).messageCount, 2);
});
test("voice commit preserves concurrent manual clears", async () => {
  const repo = new SyntraConsultationRepository(new Memory(), "voice-manual");
  await repo.stageNativeVoiceChanges("voice1", "Budget £6000", { budget: change });
  const edited = await repo.updateBrief(1, { budget: null }, 0);
  assert.deepEqual(await repo.completeNativeVoiceTurn("voice1"), edited);
});
test("empty/repeated manual saves do not invent revisions", () => {
  const initial = blankBrief();
  assert.equal(manualBrief(initial, {}, 0).revision, 0);
  const edited = manualBrief(initial, { budget: null }, 0);
  assert.equal(edited.revision, 1);
  assert.deepEqual(manualBrief(edited, { budget: null }, 1), edited);
});

const visitor: Message = { id: 1, role: "visitor", content: "Budget £6000", depth: "detailed", createdAt: "2026-10-31T00:00:00Z" };
const advisor: Message = { ...visitor, id: 2, role: "advisor", content: "What should the portal do?" };
function fixture() {
  let scope = "native-a", sends = 0;
  let admission: { status: "reserved" | "pending" | "completed"; responseId?: string } = { status: "reserved" };
  const brief = blankBrief();
  const conv: Conversation = { id: 1, title: "Native", depth: "detailed", createdAt: visitor.createdAt, updatedAt: visitor.createdAt, brief, messages: [visitor, advisor] };
  const ports: NativePorts = {
    scope, currentScope: () => scope,
    sessions: { list: async () => [], get: async () => conv, setDepth: async () => {} },
    briefs: { get: async () => brief, update: async (_id, fields, revision) => manualBrief(brief, fields, revision) },
    turns: {
      begin: async () => admission,
      attach: async () => { admission = { status: "completed", responseId: "native-response" }; },
      complete: async () => brief,
    },
    messaging: {
      busy: () => false,
      send: async (_text, _metadata, admitted) => { sends++; admitted("native-response"); },
      pair: () => ({ visitorMessage: visitor, message: advisor }),
    },
    services: async () => [], booking: { contacts: async () => [] },
    voice: { available: true, connect: async () => ({ close() {} }) },
  };
  return { ports, runtime: createNativeRuntime(ports), sends: () => sends,
    scope: (value: string) => { scope = value; }, admission: (value: typeof admission) => { admission = value; } };
}
const input = { content: visitor.content, depth: "detailed" as const, requestId: "request_runtime_1" };
test("adapter sends once, returns both canonical messages, replays completed turns", async () => {
  const f = fixture();
  const result = await f.runtime.messages.send(1, input);
  assert.equal(result.visitorMessage.id, 1);
  assert.equal(result.message.id, 2);
  assert.deepEqual(await f.runtime.messages.send(1, input), result);
  assert.equal(f.sends(), 1);
});
test("uncertain native admission is never resubmitted", async () => {
  const f = fixture();
  f.admission({ status: "pending" });
  await assert.rejects(f.runtime.messages.send(1, input), /unresolved/);
  assert.equal(f.sends(), 0);
});
test("native response recovery completes without sending again", async () => {
  const f = fixture();
  f.admission({ status: "pending", responseId: "native-response" });
  await f.runtime.messages.send(1, input);
  assert.equal(f.sends(), 0);
});
test("native busy check does not create a stranded reservation", async () => {
  const f = fixture(); let begins = 0;
  f.ports.messaging.busy = () => true;
  f.ports.turns.begin = async () => { begins++; return { status: "reserved" }; };
  await assert.rejects(f.runtime.messages.send(1, input), /busy/);
  assert.equal(begins, 0);
});
test("scope changes reject both requests and late native results", async () => {
  const f = fixture();
  f.ports.sessions.get = async () => { f.scope("native-b"); return {} as Conversation; };
  await assert.rejects(f.runtime.sessions.get(1), /session changed/);
  await assert.rejects(f.runtime.briefs.get(1), /session changed/);
});
test("native create cannot silently reuse current session", async () => {
  const f = fixture();
  await assert.rejects(f.runtime.sessions.create("detailed"), /Agent controls/);
});
test("late aborted native voice acquisition is closed", async () => {
  const f = fixture(), controller = new AbortController();
  let closes = 0, events = 0;
  f.ports.voice.connect = async (_id, emit) => {
    controller.abort(); emit({ type: "conversation-updated" });
    return { close() { closes++; } };
  };
  await assert.rejects(f.runtime.voice.connect(1, () => events++, controller.signal), /canceled/);
  assert.equal(closes, 1); assert.equal(events, 0); assert.equal(f.sends(), 0);
});
test("trusted completion denies forged identity, failed response or missing proof", () => {
  const proof = { sessionKey: "scope", requestId: "request", responseId: "response", visitorText: "Goal", reply: "Answer", status: "succeeded" as const };
  assert.equal(verifyNativeCompletion(proof, "scope", "request", "response"), proof);
  for (const invalid of [null, { ...proof, sessionKey: "other" }, { ...proof, responseId: "forged" }, { ...proof, status: "canceled" as const }]) {
    assert.throws(() => verifyNativeCompletion(invalid, "scope", "request", "response"), { status: 409 });
  }
});
const part = (overrides: Partial<NativeTranscriptPart> = {}): NativeTranscriptPart => ({
  key: "part1", responseId: "response1", role: "visitor", kind: "text", text: "Budget £6000", createdAt: visitor.createdAt, ...overrides,
});
test("native text/audio mirrors produce one visitor message and preserve existing IDs", () => {
  const transcript = new NativeTranscript();
  const before = transcript.read([part(), part({ key: "audio1", kind: "audio" })], "concise");
  assert.equal(before.length, 1);
  const after = transcript.read([part(), part({ key: "audio1", kind: "audio" }), part({ key: "answer", role: "advisor", text: "Question?" })], "concise");
  assert.deepEqual(after[0], before[0]); assert.equal(after.length, 2);
});
test("hidden/reasoning/audio playback is not another advisor transcript", () => {
  const transcript = new NativeTranscript();
  assert.equal(transcript.read([
    part({ hidden: true }), part({ reasoning: true }),
    part({ role: "advisor", kind: "audio" }),
  ], "detailed").length, 0);
});
test("streamed updates replace a native part without duplicates or dropping repeated distinct parts", () => {
  const transcript = new NativeTranscript();
  const before = transcript.read([part({ text: "Hello" })], "detailed");
  const after = transcript.read([part({ text: "Hello" }), part({ text: "Hello world" })], "detailed");
  assert.equal(after[0].message.id, before[0].message.id);
  assert.equal(after[0].message.content, "Hello world");
  assert.equal(transcript.read([part(), part({ hidden: true })], "detailed").length, 0);
  assert.equal(transcript.read([part(), part({ key: "another-real-part" })], "detailed")[0].message.content, "Budget £6000\n\nBudget £6000");
});
