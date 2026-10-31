import test from "node:test";
import assert from "node:assert/strict";
import { briefCompleteness, formatProjectBrief, safeContactHref, HandoffCoordinator, HandoffError, type EnquiryInput } from "./handoff.ts";
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
