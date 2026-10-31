import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, ConsultationService, DEPTH_GUIDANCE, manualBrief, mergeBrief, parseAdvisorResult } from "./engine.ts";
import { EMPTY_FIELDS } from "./types.ts";
import type { AdvisorResult, Brief, Conversation, ConversationRepository, TurnReply } from "./types.ts";

const empty = (): Brief => ({ ...EMPTY_FIELDS, revision: 0, provenance: {} });
const result = (changes: AdvisorResult["changes"]): AdvisorResult => ({ reply: "A focused portal is a relevant direction. Who will approve designs?", changes, suggestedNextSteps: [] });

test("qualification fills all eight fields from grounded visitor information", () => {
  const latest = "Design approvals for clients. Client portals & dashboards. Build a portal with approval buttons, connect Slack, budget £8000, launch in June, review scope next.";
  const values = {
    objective: "Design approvals for clients", service: "Client portals & dashboards",
    proposedSolution: "Build a portal", requirements: "approval buttons",
    integrations: "connect Slack", budget: "£8000", timeline: "launch in June", nextStep: "review scope next",
  };
  const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, status: "confirmed", evidence: value }]));
  const updated = mergeBrief(empty(), result(changes), [latest], latest);
  assert.equal(Object.values(values).filter(v => Object.values(updated).includes(v)).length, 8);
  assert.equal(updated.revision, 1);
});
test("AI cannot invent a field without visitor evidence", () => {
  const b = mergeBrief(empty(), result({ budget: { value: "£10000", status: "confirmed", evidence: "Budget £10000" } }), ["I need a portal"], "I need a portal");
  assert.equal(b.budget, null);
});
test("provider presentation quotes do not discard grounded evidence", () => {
  const latest = 'I want a design approvals portal. Budget: £6000.';
  const b = mergeBrief(empty(), result({
    objective: { value: "Design approvals portal", status: "confirmed", evidence: '"I want a design approvals portal."' },
    budget: { value: "£6000", status: "confirmed", evidence: '“Budget: £6000.”' },
  }), [latest], latest);
  assert.equal(b.budget, "£6000");
  assert.equal(b.objective, "Design approvals portal");
  assert.equal(b.provenance.budget?.evidence, "Budget: £6000.");
});
test("advisor's own proposal is not visitor evidence", () => {
  const b = mergeBrief(empty(), result({ requirements: { value: "SSO", status: "confirmed", evidence: "Add SSO" } }), ["I need a dashboard"], "I need a dashboard");
  assert.equal(b.requirements, null);
});
test("suggested solution is distinct from confirmed requirements", () => {
  const b = mergeBrief(empty(), result({
    proposedSolution: { value: "A design portal", status: "suggested", evidence: "design reviews" },
    requirements: { value: "Enterprise SSO", status: "suggested", evidence: "design reviews" },
  }), ["Help with design reviews"], "Help with design reviews");
  assert.equal(b.provenance.proposedSolution?.status, "suggested");
  assert.equal(b.requirements, null);
});
test("manual correction survives stale AI facts and suggestions", () => {
  const manual = manualBrief(empty(), { budget: "£5000" }, 0);
  const b = mergeBrief(manual, result({ budget: { value: "£15000", status: "confirmed", evidence: "£15000" } }), ["Previously £15000", "Show me options"], "Show me options");
  assert.equal(b.budget, "£5000");
  assert.equal(b.provenance.budget?.status, "manual");
});
test("explicit later visitor correction can replace manual budget", () => {
  const manual = manualBrief(empty(), { budget: "£5000" }, 0);
  const latest = "Actually change the budget to £9000";
  const b = mergeBrief(manual, result({ budget: { value: "£9000", status: "confirmed", evidence: latest } }), [latest], latest);
  assert.equal(b.budget, "£9000");
  assert.equal(b.provenance.budget?.status, "confirmed");
});
test("unrelated correction cannot overwrite a manually edited field", () => {
  const manual = manualBrief(empty(), { budget: "£5000" }, 0);
  const latest = "Actually change the deadline to June";
  assert.equal(mergeBrief(manual, result({ budget: { value: "£15000", status: "confirmed", evidence: latest } }), [latest], latest).budget, "£5000");
});
test("explicit correction replaces conflicting earlier answer", () => {
  const current = { ...empty(), timeline: "May", provenance: { timeline: { status: "confirmed" as const, evidence: "May" } } };
  const latest = "Actually the deadline is July, not May";
  const b = mergeBrief(current, result({ timeline: { value: "July", status: "confirmed", evidence: latest } }), ["May", latest], latest);
  assert.equal(b.timeline, "July");
});
test("null does not silently erase a known answer", () => {
  const current = manualBrief(empty(), { integrations: "Slack" }, 0);
  assert.equal(mergeBrief(current, result({ integrations: { value: null, status: "confirmed", evidence: "not sure" } }), ["not sure"], "not sure").integrations, "Slack");
});
test("intentionally cleared manual field remains cleared", () => {
  const cleared = manualBrief(empty(), { budget: null }, 0);
  assert.equal(cleared.provenance.budget?.status, "manual");
  assert.equal(mergeBrief(cleared, result({ budget: { value: "£5000", status: "confirmed", evidence: "£5000" } }), ["£5000", "What next?"], "What next?").budget, null);
});
test("manual edit rejects stale revision and leaves original intact", () => {
  const current = manualBrief(empty(), { objective: "Client reviews" }, 0);
  assert.throws(() => manualBrief(current, { objective: "Lost edit" }, 0), /brief changed/);
  assert.equal(current.objective, "Client reviews");
});
test("depth changes have distinct decision, explanation and comparison policies", () => {
  assert.match(DEPTH_GUIDANCE.concise, /single most relevant/);
  assert.match(DEPTH_GUIDANCE.detailed, /key trade-off/);
  assert.match(DEPTH_GUIDANCE.deep_dive, /compare two|compare practical|compare/i);
  assert.match(DEPTH_GUIDANCE.deep_dive, /security|risks/i);
});
test("consultation policy covers objections, unknown budgets, scope and honest business claims", () => {
  const prompt = buildSystemPrompt("Client portals");
  for (const term of ["ONE intelligent question", "unrealistic budgets", "out-of-scope", "Never invent", "Manual corrections", "do not know"]) assert.ok(prompt.includes(term), term);
});
test("malformed and multi-question provider output fails explicitly", () => {
  assert.throws(() => parseAdvisorResult('{"reply":""}', false));
  assert.throws(() => parseAdvisorResult('{"reply":"Budget? Timeline?"}', false));
  assert.throws(() => parseAdvisorResult("not JSON", false));
  assert.throws(() => parseAdvisorResult('{"reply":"A valid reply but no extraction result"}', false), /structured brief/);
});
test("provider parser validates provenance and bounds unsafe extras", () => {
  const parsed = parseAdvisorResult(JSON.stringify({ reply: "A focused first build.", changes: { madeUp: { value: "secret" }, budget: { value: 42 }, objective: { value: "Review designs", status: "confirmed", evidence: "Review designs" } }, title: "Do not retitle", suggestedNextSteps: ["Yes", 3] }), false);
  assert.equal(parsed.title, undefined);
  assert.deepEqual(Object.keys(parsed.changes), ["objective"]);
  assert.deepEqual(parsed.suggestedNextSteps, ["Yes"]);
});

function fixture() {
  const c: Conversation = { id: 1, title: "Test", depth: "detailed", createdAt: "", updatedAt: "", messages: [], brief: empty() };
  let committed = 0;
  let received: unknown;
  const saved: TurnReply = {
    visitorMessage: { id: 1, role: "visitor", content: "Design reviews", depth: "concise", createdAt: "" },
    message: { id: 2, role: "advisor", content: "A portal fits.", depth: "concise", createdAt: "" },
    brief: empty(), suggestedNextSteps: [],
  };
  const repository: ConversationRepository = {
    list: async () => [], create: async () => c,
    get: async owner => owner === "owner-a" ? c : null,
    replay: async () => null,
    commitTurn: async () => { committed++; return saved; },
    editBrief: async () => empty(),
  };
  const provider = { consult: async (input: unknown) => { received = input; return result({}); } };
  return { repository, provider, c, saved, commits: () => committed, received: () => received };
}
test("session owner isolation prevents reading or invoking AI for another visitor", async () => {
  const f = fixture();
  await assert.rejects(new ConsultationService(f.repository, f.provider).send("owner-b", 1, { content: "Hi", depth: "detailed", requestId: "a" }), /not found/);
  assert.equal(f.commits(), 0); assert.equal(f.received(), undefined);
});
test("AI failure does not save a partial visitor turn or corrupt the brief", async () => {
  const f = fixture();
  await assert.rejects(new ConsultationService(f.repository, { consult: async () => { throw new Error("provider down"); } }).send("owner-a", 1, { content: "Hi", depth: "detailed", requestId: "a" }), /provider down/);
  assert.equal(f.commits(), 0);
});
test("idempotent retry replays the saved turn without calling provider", async () => {
  const f = fixture();
  f.repository.replay = async () => f.saved;
  const reply = await new ConsultationService(f.repository, f.provider).send("owner-a", 1, { content: "Design reviews", depth: "concise", requestId: "same" });
  assert.equal(reply, f.saved); assert.equal(f.received(), undefined); assert.equal(f.commits(), 0);
});
test("a request ID cannot be reused for changed content", async () => {
  const f = fixture(); f.repository.replay = async () => f.saved;
  await assert.rejects(new ConsultationService(f.repository, f.provider).send("owner-a", 1, { content: "A different message", depth: "concise", requestId: "same" }), /different message/);
});
test("old quotes cannot revert a corrected confirmed answer", () => {
  const current = { ...empty(), budget: "£9000", provenance: { budget: { status: "confirmed" as const, evidence: "£9000" } } };
  const b = mergeBrief(current, result({ budget: { value: "£5000", status: "confirmed", evidence: "£5000" } }), ["£5000", "Actually £9000", "Show options"], "Show options");
  assert.equal(b.budget, "£9000");
});
test("a generic goal quote cannot justify a fabricated budget", () => {
  const b = mergeBrief(empty(), result({ budget: { value: "£5000", status: "confirmed", evidence: "I need a dashboard" } }), ["I need a dashboard"], "I need a dashboard");
  assert.equal(b.budget, null);
});
test("depth switch and prior answers reach provider together", async () => {
  const f = fixture();
  f.c.messages.push({ id: 1, role: "visitor", content: "Budget £5000", depth: "concise", createdAt: "" });
  f.c.brief = manualBrief(empty(), { budget: "£5000" }, 0);
  await new ConsultationService(f.repository, f.provider).send("owner-a", 1, { content: "Compare two options", depth: "deep_dive", requestId: "next" });
  const input = f.received() as { depth: string; history: { content: string }[]; currentBrief: Brief };
  assert.equal(input.depth, "deep_dive"); assert.equal(input.currentBrief.budget, "£5000"); assert.equal(input.history[0].content, "Budget £5000");
});
test("empty and oversized messages are rejected before provider or storage", async () => {
  const f = fixture();
  for (const content of ["  ", "x".repeat(12001)]) await assert.rejects(new ConsultationService(f.repository, f.provider).send("owner-a", 1, { content, depth: "concise", requestId: "a" }), /characters/);
  assert.equal(f.commits(), 0);
});
