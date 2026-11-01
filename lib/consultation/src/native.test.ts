import assert from "node:assert/strict";
import { test } from "node:test";
import { SyntraConsultationRepository, blankBrief, type NativeStorage } from "./native-repository.ts";
import { createNativeRuntime, type NativePorts } from "./native-runtime.ts";
import { NativeTranscript, nativeTranscriptPair, type NativeTranscriptPart } from "./native-transcript.ts";
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
test("native reservations and receipts bind one specialist without changing the shared brief", async () => {
  const storage = new Memory();
  const repo = new SyntraConsultationRepository(storage, "native-specialist");
  const brief = await repo.updateBrief(1, { budget: "£6000" }, 0);
  await repo.beginTurn(1, "specialist_request", "Design the integration", "deep_dive", "technical");
  await assert.rejects(repo.beginTurn(1, "specialist_request", "Design the integration", "deep_dive", "automation"), { status: 409 });
  await repo.attachResponseId("specialist_request", "specialist-response");
  await repo.completeTurn("specialist_request", "specialist-response", "Here is the approach", "Design the integration");
  const restarted = new SyntraConsultationRepository(storage, "native-specialist");
  assert.equal((await restarted.beginTurn(1, "specialist_request", "Design the integration", "deep_dive", "technical")).status, "completed");
  await assert.rejects(restarted.beginTurn(1, "specialist_request", "Design the integration", "deep_dive", "automation"), { status: 409 });
  assert.deepEqual((await restarted.get(1)).brief, brief);
});
test("native legacy receipts without specialist metadata replay only as Syntra", async () => {
  const { storage, repo } = await reserve("legacy-specialist");
  await repo.attachResponseId("request_native_1", "response1");
  await repo.completeTurn("request_native_1", "response1", "Saved legacy reply", "Budget £6000");
  for (const [path, contents] of storage.files) {
    const old = JSON.parse(contents);
    for (const turn of old.turns) delete turn.specialist;
    storage.files.set(path, JSON.stringify(old));
  }
  const restarted = new SyntraConsultationRepository(storage, "legacy-specialist");
  assert.equal((await restarted.beginTurn(1, "request_native_1", "Budget £6000", "deep_dive", "syntra")).status, "completed");
  await assert.rejects(restarted.beginTurn(1, "request_native_1", "Budget £6000", "deep_dive", "technical"), { status: 409 });
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
test("native typed and voice reservations exclude new cross-mode work until successful completion", async () => {
  const storage = new Memory();
  const first = new SyntraConsultationRepository(storage, "cross-mode-success");
  const second = new SyntraConsultationRepository(storage, "cross-mode-success");
  await first.stageNativeVoiceChanges("voice-first", "Budget £6000", { budget: change });
  await assert.rejects(second.beginTurn(1, "typed_after_voice", "Plan my portal", "detailed"), { status: 409 });
  await assert.rejects(second.stageNativeVoiceChanges("voice-second", "Another request", {}), { status: 409 });
  await second.stageNativeVoiceChanges("voice-first", "Budget £6000", { budget: change });
  assert.equal((await first.get(1)).brief.budget, null, "Repeated staging is not a successful response");

  const voiceBrief = await first.completeNativeVoiceTurn("voice-first", "Budget £6000");
  assert.equal(voiceBrief.budget, "£6000");
  assert.equal((await second.beginTurn(1, "typed_after_voice", "Plan my portal", "detailed")).status, "reserved");
  assert.equal((await first.beginTurn(1, "typed_after_voice", "Plan my portal", "detailed")).status, "pending");
  await assert.rejects(first.stageNativeVoiceChanges("voice-second", "Another request", {}), { status: 409 });
  assert.deepEqual((await first.stageNativeVoiceChanges("voice-first", "Budget £6000", {})).brief, voiceBrief);
  assert.deepEqual(await first.completeNativeVoiceTurn("voice-first", "Budget £6000"), voiceBrief);

  await second.attachResponseId("typed_after_voice", "typed-response");
  await second.completeTurn("typed_after_voice", "typed-response", "We can plan the portal.", "Plan my portal");
  await first.stageNativeVoiceChanges("voice-second", "Another request", {});
  assert.equal((await second.beginTurn(1, "typed_after_voice", "Plan my portal", "detailed")).status, "completed",
    "A completed typed receipt remains recoverable while voice is active");
  assert.equal((await first.get(1)).messageCount, 4, "Replays and blocked requests must not append messages");
});
test("native trusted terminal release unblocks the other mode without committing discarded drafts", async () => {
  const { storage, repo } = await reserve("cross-mode-release");
  await repo.stageBriefChanges("request_native_1", { budget: change });
  const resumed = new SyntraConsultationRepository(storage, "cross-mode-release");
  await assert.rejects(resumed.stageNativeVoiceChanges("voice-next", "Budget £6000", { budget: change }), { status: 409 });
  // Only the trusted lifecycle calls discard after its terminal-evidence check.
  await resumed.discardTurn("request_native_1");
  await repo.stageNativeVoiceChanges("voice-next", "Budget £6000", { budget: change });
  await assert.rejects(resumed.beginTurn(1, "typed_after_release", "Plan the integration", "detailed"), { status: 409 });
  await resumed.discardTurn("voice-next", true);
  await assert.rejects(repo.completeNativeVoiceTurn("voice-next", "Budget £6000"), { status: 404 });
  assert.equal((await repo.beginTurn(1, "typed_after_release", "Plan the integration", "detailed")).status, "reserved");
  const snapshot = await resumed.get(1);
  assert.equal(snapshot.brief.budget, null);
  assert.equal(snapshot.messageCount, 0);
});
test("native shared gate admits only one simultaneous typed or distinct voice reservation", async () => {
  for (const order of ["typed-first", "voice-first", "two-voice"] as const) {
    const storage = new Memory();
    const first = new SyntraConsultationRepository(storage, `cross-mode-race-${order}`);
    const second = new SyntraConsultationRepository(storage, `cross-mode-race-${order}`);
    await first.ensureSession();
    const typed = () => first.beginTurn(1, "simultaneous_typed", "Design the portal", "detailed");
    const voice = () => second.stageNativeVoiceChanges("simultaneous-voice", "Automate our workflow", {});
    const operations = order === "typed-first" ? [typed, voice]
      : order === "voice-first" ? [voice, typed]
      : [voice, () => first.stageNativeVoiceChanges("different-voice", "A separate request", {})];
    const results = await Promise.allSettled(operations.map(operation => operation()));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1, order);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    assert.equal(rejected.reason.status, 409, order);
    assert.equal((await first.get(1)).messageCount, 0);
  }
});
test("native legacy overlapping reservations can finish without permitting fresh work", async () => {
  const { storage } = await reserve("legacy-cross-mode");
  for (const [path, raw] of storage.files) {
    const legacy = JSON.parse(raw);
    legacy.pendingVoice = { "legacy-voice": { content: "Plan our portal", changes: {}, baseBrief: legacy.brief } };
    storage.files.set(path, JSON.stringify(legacy));
  }
  const restarted = new SyntraConsultationRepository(storage, "legacy-cross-mode");
  assert.equal((await restarted.beginTurn(1, "request_native_1", "Budget £6000", "deep_dive")).status, "pending");
  await restarted.stageNativeVoiceChanges("legacy-voice", "Plan our portal", {});
  await assert.rejects(restarted.beginTurn(1, "fresh_typed_request", "A new request", "detailed"), { status: 409 });
  await assert.rejects(restarted.stageNativeVoiceChanges("fresh-voice", "A new request", {}), { status: 409 });
  await restarted.attachResponseId("request_native_1", "legacy-response");
  await restarted.completeTurn("request_native_1", "legacy-response", "Let's plan it.", "Budget £6000");
  await assert.rejects(restarted.beginTurn(1, "fresh_typed_request", "A new request", "detailed"), { status: 409 });
  await restarted.completeNativeVoiceTurn("legacy-voice", "Plan our portal");
  assert.equal((await restarted.beginTurn(1, "fresh_typed_request", "A new request", "detailed")).status, "reserved");
  assert.equal((await restarted.get(1)).messageCount, 4);
});
test("native turn limit counts voice history before admitting text and preserves completed replays", async () => {
  const repo = new SyntraConsultationRepository(new Memory(), "combined-turn-cap");
  await repo.beginTurn(1, "typed_before_voice", "Plan my project", "detailed");
  await repo.attachResponseId("typed_before_voice", "typed-response");
  await repo.completeTurn("typed_before_voice", "typed-response", "What should it do?", "Plan my project");
  for (let index = 0; index < 119; index++) {
    await repo.stageNativeVoiceChanges(`voice-${index}`, `Project detail ${index}`, {});
    await repo.completeNativeVoiceTurn(`voice-${index}`, `Project detail ${index}`);
  }
  const before = await repo.get(1);
  assert.equal(before.messageCount, 240);
  await assert.rejects(repo.beginTurn(1, "text_after_full_voice", "A new request", "detailed"), { status: 422 });
  assert.deepEqual(await repo.beginTurn(1, "typed_before_voice", "Plan my project", "detailed"), {
    status: "completed", responseId: "typed-response",
  });
  assert.deepEqual(await repo.completeNativeVoiceTurn("voice-118", "Project detail 118"), before.brief);
  assert.equal((await repo.get(1)).messageCount, before.messageCount);
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
test("native message admission carries the captured specialist to the existing runtime", async () => {
  const f = fixture();
  let metadata: Record<string, unknown> | undefined;
  f.ports.messaging.send = async (_text, value, admitted) => { metadata = value; admitted("native-response"); };
  await f.runtime.messages.send(1, { ...input, specialist: "technical" });
  assert.equal(metadata?.syntraSpecialist, "technical");
  assert.equal(metadata?.syntraRequestId, input.requestId);
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
test("native conversion ports require literal consent before any external provider call", async () => {
  const f = fixture();
  let bookings = 0, enquiries = 0;
  f.ports.booking.book = async () => { bookings++; return { status: "confirmed", reference: "BOOKING-1" }; };
  f.ports.booking.submitEnquiry = async () => { enquiries++; return { status: "confirmed", reference: "ENQUIRY-1" }; };
  const runtime = createNativeRuntime(f.ports);
  const enquiry = { conversationId: 1, requestId: "consented_request", briefRevision: 0,
    brief: { ...blankBrief(), objective: "Plan my project" }, name: "Jane Example", email: "jane@example.com", consent: true };
  for (const consent of [false, "false", "true", 1, undefined, null]) {
    await assert.rejects(runtime.booking.book!(1, consent as boolean), /confirmation/);
    await assert.rejects(runtime.booking.submitEnquiry!({ ...enquiry, consent: consent as boolean }), /confirmation/);
  }
  assert.equal(bookings, 0);
  assert.equal(enquiries, 0);
  await runtime.booking.book!(1, true);
  await runtime.booking.submitEnquiry!(enquiry);
  assert.equal(bookings, 1);
  assert.equal(enquiries, 1);
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
test("hidden/reasoning and audio without a transcript never create visible messages", () => {
  const transcript = new NativeTranscript();
  assert.equal(transcript.read([
    part({ hidden: true }), part({ reasoning: true }),
    part({ role: "advisor", kind: "audio", text: "" }),
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
test("native completion selects its own visitor from interleaved responses", () => {
  const transcript = new NativeTranscript();
  const entries = transcript.read([
    part({ key: "visitor-a", responseId: "response-a", text: "Build a portal" }),
    part({ key: "visitor-b", responseId: "response-b", text: "Automate my CRM" }),
    part({ key: "advisor-a", responseId: "response-a", role: "advisor", text: "A client portal fits." }),
  ], "detailed");
  const pair = nativeTranscriptPair(entries, "response-a")!;
  assert.equal(pair.visitorMessage.content, "Build a portal");
  assert.equal(pair.message.content, "A client portal fits.");
  assert.equal(nativeTranscriptPair(entries, "response-b"), null);
  assert.deepEqual(nativeTranscriptPair(entries.toReversed(), "response-a"), pair);
  assert.deepEqual(nativeTranscriptPair(entries, "response-a"), pair);
});
test("native completion waits for its canonical pair instead of fabricating a visitor", () => {
  const transcript = new NativeTranscript();
  const entries = transcript.read([
    part({ key: "earlier-visitor", responseId: "earlier", text: "Unrelated prior question" }),
    part({ key: "current-advisor", responseId: "current", role: "advisor", text: "Current answer" }),
  ], "concise");
  assert.equal(nativeTranscriptPair(entries, "current"), null);
  assert.equal(nativeTranscriptPair(entries, "missing"), null);
  assert.equal(nativeTranscriptPair([], "current"), null);
});


test("canonical audio-only native exchanges remain visible and text mirrors replace without duplication", () => {
  const transcript = new NativeTranscript();
  const audio = [part({ key: "heard", kind: "audio" }),
    part({ key: "spoken", role: "advisor", kind: "audio", text: "A focused portal fits." })];
  const first = transcript.read(audio, "concise");
  const pair = nativeTranscriptPair(first, "response1")!;
  assert.equal(first.length, 2);
  assert.equal(pair.message.content, "A focused portal fits.");
  const mirrored = transcript.read([...audio,
    part({ key: "written", role: "advisor", text: "A focused portal fits. What needs approval?" })], "concise");
  assert.equal(mirrored.length, 2);
  assert.equal(mirrored[1].message.id, pair.message.id);
  assert.equal(mirrored[1].message.content, "A focused portal fits. What needs approval?");
});

test("native completion preserves a response-depth preference changed during generation", async () => {
  const { repo } = await reserve("depth-changed-during-generation");
  await repo.attachResponseId("request_native_1", "response1");
  await repo.ensureSession("concise");
  await repo.completeTurn("request_native_1", "response1", "Here is the detailed comparison.", "Budget £6000");
  const snapshot = await repo.get(1);
  assert.equal(snapshot.depth, "concise", "The next response uses the visitor's latest preference");
  assert.equal(snapshot.turns[0].depth, "deep_dive", "The completed response keeps its admitted depth");
});

test("native voice receipts preserve admitted depth, first title and canonical response identity across reload", async () => {
  const storage = new Memory();
  const repo = new SyntraConsultationRepository(storage, "voice-depth-receipt");
  await repo.ensureSession("deep_dive");
  assert.equal((await repo.stageNativeVoiceChanges("voice-context", "Plan an approvals portal", {})).depth, "deep_dive");
  await repo.ensureSession("concise");
  assert.equal((await repo.stageNativeVoiceChanges("voice-context", "Plan an approvals portal", {})).depth, "deep_dive");
  await repo.completeNativeVoiceTurn("voice-context", "Plan an approvals portal", "native-response-context");
  const resumed = new SyntraConsultationRepository(storage, "voice-depth-receipt");
  const snapshot = await resumed.get(1);
  assert.equal(snapshot.depth, "concise");
  assert.equal(snapshot.title, "Plan an approvals portal");
  assert.equal(snapshot.messageCount, 2);
  assert.equal(snapshot.turns[0].responseId, "native-response-context");
  assert.equal(snapshot.turns[0].depth, "deep_dive");
  assert.equal((await resumed.stageNativeVoiceChanges("voice-context", "Plan an approvals portal", {})).depth, "deep_dive");
  await assert.rejects(resumed.stageNativeVoiceChanges("voice-context", "A different transcript", {}), { status: 409 });
  await assert.rejects(resumed.completeNativeVoiceTurn("voice-context", "A different transcript"), { status: 409 });
  await assert.rejects(resumed.completeNativeVoiceTurn("voice-context", "Plan an approvals portal", "another-response"), { status: 409 });
  await resumed.beginTurn(1, "typed_after_first_voice", "Discuss integrations", "detailed");
  await resumed.attachResponseId("typed_after_first_voice", "typed-response");
  await resumed.completeTurn("typed_after_first_voice", "typed-response", "We can connect the systems.");
  assert.equal((await resumed.get(1)).title, "Plan an approvals portal", "Switching mode does not replace the first-turn title");
});


test("native optional voice metadata rejects corruption without rewriting the stored record", async () => {
  const mutations = [
    (record: Record<string, unknown>) => { record.voiceContexts = {}; },
    (record: Record<string, unknown>) => { record.voiceContexts = [{ turnId: "voice", depth: "invalid", createdAt: visitor.createdAt }]; },
    (record: Record<string, unknown>) => { record.voiceContexts = [{ turnId: "voice", depth: "concise", createdAt: visitor.createdAt, responseId: 12 }]; },
    (record: Record<string, unknown>) => { record.pendingVoice = { voice: { content: "Plan a portal", changes: {}, depth: "invalid" } }; },
    (record: Record<string, unknown>) => { record.pendingVoice = { voice: { content: "Plan a portal", changes: {}, createdAt: "not-a-date" } }; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const storage = new Memory();
    const repo = new SyntraConsultationRepository(storage, `invalid-metadata-${index}`);
    await repo.ensureSession();
    for (const [path, raw] of storage.files) {
      const record = JSON.parse(raw);
      mutate(record);
      const corrupted = JSON.stringify(record);
      storage.files.set(path, corrupted);
      await assert.rejects(repo.get(1), /Invalid Syntra consultation record/);
      assert.equal(storage.files.get(path), corrupted, "A malformed record is never silently discarded or replaced");
    }
  }
});

test("legacy native voice drafts without new depth metadata remain recoverable", async () => {
  const storage = new Memory();
  const repo = new SyntraConsultationRepository(storage, "legacy-voice-metadata");
  await repo.ensureSession("concise");
  await repo.stageNativeVoiceChanges("legacy-voice", "Plan a portal", {});
  for (const [path, raw] of storage.files) {
    const record = JSON.parse(raw);
    delete record.voiceContexts;
    delete record.pendingVoice["legacy-voice"].depth;
    delete record.pendingVoice["legacy-voice"].createdAt;
    storage.files.set(path, JSON.stringify(record));
  }
  const resumed = new SyntraConsultationRepository(storage, "legacy-voice-metadata");
  await resumed.completeNativeVoiceTurn("legacy-voice", "Plan a portal");
  assert.equal((await resumed.get(1)).messageCount, 2);
  assert.equal((await resumed.get(1)).depth, "concise");
});
