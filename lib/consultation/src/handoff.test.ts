import test from "node:test";
import assert from "node:assert/strict";
import { briefCompleteness, formatProjectBrief, safeContactHref, HandoffCoordinator, readEnquiryAttempt, saveEnquiryAttempt, validateEnquiry, type EnquiryInput } from "./handoff.ts";
import { EMPTY_FIELDS, type Brief } from "./types.ts";

const brief: Brief = { ...EMPTY_FIELDS, revision: 3, objective: "Reduce manual follow-up", budget: "£7,000", service: "AI automation systems",
  provenance: { objective: { status: "confirmed", evidence: "Reduce manual follow-up" }, budget: { status: "manual", evidence: "Edited in the project brief" }, service: { status: "suggested", evidence: "We need automation" } } };
const input: EnquiryInput = { conversationId: 12, requestId: "request-abc123", briefRevision: 3, brief, name: "Jane Doe", email: "jane@example.com", consent: true };

test("brief export preserves visitor data and labels uncertainty without a quote", () => {
  const output = formatProjectBrief(brief);
  assert.match(output, /£7,000/);
  assert.match(output, /Edited by visitor/);
  assert.match(output, /Suggested/);
  assert.match(output, /Not established yet/);
  assert.match(output, /not a formal quotation/);
});
test("completeness is grounded in populated fields", () => {
  assert.deepEqual(briefCompleteness(brief), { complete: 3, total: 8, suggested: 1 });
});
test("contact destinations reject unsafe protocols or credentials", () => {
  assert.equal(safeContactHref({ id: "1", label: "", detail: "", href: "javascript:alert(1)", kind: "link" }), null);
  assert.equal(safeContactHref({ id: "2", label: "", detail: "", href: "https://user:pass@example.com", kind: "link" }), null);
  assert.equal(safeContactHref({ id: "3", label: "", detail: "", href: "https://example.com/book", kind: "link" }), "https://example.com/book");
  assert.equal(safeContactHref({ id: "4", label: "", detail: "", href: "mailto:hello@example.com?bcc=attacker", kind: "email" }), null);
});
test("explicit consent is required before the gateway is contacted", async () => {
  let calls = 0;
  const coordinator = new HandoffCoordinator();
  await assert.rejects(coordinator.submit({ ...input, consent: false }, { submitEnquiry: async () => { calls++; return { status: "confirmed", reference: "X" }; } }), { code: "consent" });
  assert.equal(calls, 0);
});
test("unconfigured gateway never reports a completed enquiry", async () => {
  await assert.rejects(new HandoffCoordinator().submit(input), { code: "unconfirmed" });
});
test("concurrent identical attempts use one external request and completed replays reuse receipt", async () => {
  let calls = 0;
  const gateway = { submitEnquiry: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return { status: "confirmed" as const, reference: "PROVIDER-482" }; } };
  const coordinator = new HandoffCoordinator();
  const [a, b] = await Promise.all([coordinator.submit(input, gateway), coordinator.submit(input, gateway)]);
  assert.deepEqual(a, b);
  assert.equal(a.reference, "PROVIDER-482");
  assert.deepEqual(await coordinator.submit(input, gateway), a);
  assert.equal(calls, 1);
});
test("request ID collision cannot silently change a submission", async () => {
  const coordinator = new HandoffCoordinator();
  const gateway = { submitEnquiry: async () => ({ status: "confirmed" as const, reference: "T-1" }) };
  await coordinator.submit(input, gateway);
  await assert.rejects(coordinator.submit({ ...input, email: "another@example.com" }, gateway), { code: "collision" });
});
test("provider failures can be retried but do not create false confirmations", async () => {
  let calls = 0;
  const coordinator = new HandoffCoordinator();
  await assert.rejects(coordinator.submit(input, { submitEnquiry: async () => { calls++; throw Error("offline"); } }));
  const confirmed = await coordinator.submit(input, { submitEnquiry: async () => { calls++; return { status: "confirmed" as const, reference: "REAL-2" }; } });
  assert.equal(calls, 2);
  assert.equal(confirmed.reference, "REAL-2");
});
test("missing provider reference is rejected as unconfirmed", async () => {
  await assert.rejects(new HandoffCoordinator().submit(input, { submitEnquiry: async () => ({ status: "confirmed", reference: "  " }) }), { code: "unconfirmed" });
});

test("encoded email headers are not approved contact destinations", () => {
  assert.equal(safeContactHref({ id: "1", label: "", detail: "", href: "mailto:hello%0d%0abcc:other@example.com", kind: "email" }), null);
});
test("a missing objective cannot be submitted", async () => {
  await assert.rejects(new HandoffCoordinator().submit({ ...input, brief: { ...input.brief, objective: null } }), { code: "details" });
});
test("consented attempt snapshots survive refresh with the original ID and reviewed fields", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveEnquiryAttempt(storage, "scope-a", { input, state: "pending" });
  const recovered = readEnquiryAttempt(storage, "scope-a", input.conversationId)!;
  assert.equal(recovered.input.requestId, input.requestId);
  assert.equal(recovered.input.brief.budget, "£7,000");
  assert.equal(readEnquiryAttempt(storage, "scope-b", input.conversationId), null);
  assert.throws(() => readEnquiryAttempt(storage, "scope-a", 99), { code: "unconfirmed" });
  saveEnquiryAttempt(storage, "scope-a", { input, state: "confirmed", receipt: { status: "confirmed", reference: "VERIFIED-1" } });
  assert.equal(readEnquiryAttempt(storage, "scope-a", input.conversationId)!.receipt!.reference, "VERIFIED-1");
});
test("unsafe saved attempts fail explicitly and unconsented details are never cached", () => {
  let written = false;
  const storage = { getItem: () => '{"state":"confirmed"}', setItem: () => { written = true; } };
  assert.throws(() => readEnquiryAttempt(storage, "a", input.conversationId), { code: "unconfirmed" });
  assert.throws(() => saveEnquiryAttempt(storage, "a", { input: { ...input, consent: false }, state: "pending" }), { code: "consent" });
  assert.equal(written, false);
});
test("a truthy string is not explicit consent", async () => {
  await assert.rejects(new HandoffCoordinator().submit({ ...input, consent: "yes" as unknown as boolean }), { code: "consent" });
});

test("an unconfirmed provider outcome cannot reuse its request ID for a changed enquiry", async () => {
  const coordinator = new HandoffCoordinator();
  let calls = 0;
  const gateway = { submitEnquiry: async () => { calls++; throw Error("Lost acknowledgement"); } };
  await assert.rejects(coordinator.submit(input, gateway));
  await assert.rejects(coordinator.submit({ ...input, brief: { ...input.brief, budget: "£25,000" } }, gateway), { code: "collision" });
  assert.equal(calls, 1);
  await assert.rejects(coordinator.submit(input, gateway), /Lost acknowledgement/);
  assert.equal(calls, 2, "Only the original reviewed intent can be retried");
});

test("admission snapshots protect consented fields from caller mutation", async () => {
  const candidate = { ...input, brief: { ...input.brief } };
  let received: EnquiryInput | undefined;
  const pending = new HandoffCoordinator().submit(candidate, { submitEnquiry: async value => {
    received = value;
    assert.ok(Object.isFrozen(value));
    assert.ok(Object.isFrozen(value.brief));
    return { status: "confirmed", reference: "reviewed-original" };
  } });
  candidate.brief.objective = "A different project";
  candidate.name = "Different person";
  candidate.requestId = "different-request";
  await pending;
  assert.equal(received?.brief.objective, input.brief.objective);
  assert.equal(received?.name, input.name);
  assert.equal(received?.requestId, input.requestId);
  assert.deepEqual(Object.keys(received!.brief).sort(), Object.keys(EMPTY_FIELDS).sort());
});

test("receipt consumers cannot change a cached provider reference", async () => {
  const coordinator = new HandoffCoordinator();
  let calls = 0;
  const gateway = { submitEnquiry: async () => { calls++; return { status: "confirmed" as const, reference: "original-reference" }; } };
  const [first, second] = await Promise.all([coordinator.submit(input, gateway), coordinator.submit(input, gateway)]);
  first.reference = "changed";
  assert.equal(second.reference, "original-reference");
  assert.equal((await coordinator.submit(input, gateway)).reference, "original-reference");
  assert.equal(calls, 1);
});

test("malformed or oversized saved enquiry fields fail closed", () => {
  for (const malformed of [
    { ...input, name: null }, { ...input, email: 3 }, { ...input, note: {} },
    { ...input, requestId: 12345678 }, { ...input, brief: null },
    { ...input, brief: { ...input.brief, budget: 5000 } },
    { ...input, brief: { ...input.brief, requirements: "x".repeat(4001) } },
  ]) {
    assert.throws(() => validateEnquiry(malformed as unknown as EnquiryInput), { code: "details" });
    const storage = { getItem: () => JSON.stringify({ input: malformed, state: "pending" }), setItem: () => {} };
    assert.throws(() => readEnquiryAttempt(storage, "scope", input.conversationId), { code: "unconfirmed" });
  }
});
