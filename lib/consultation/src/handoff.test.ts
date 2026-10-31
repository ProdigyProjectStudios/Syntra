import test from "node:test";
import assert from "node:assert/strict";
import { assessHandoff, createHandoffPacket, formatHandoffJSON, formatHandoffMarkdown, handoffFileName } from "./handoff.ts";
import { EMPTY_FIELDS } from "./types.ts";
import type { Brief } from "./types.ts";

const date = new Date("2026-10-31T12:00:00.000Z");
const empty = (): Brief => ({ ...EMPTY_FIELDS, revision: 0, provenance: {} });

test("no visitor information is never called a ready or qualified project", () => {
  const a = assessHandoff(empty());
  assert.equal(a.status, "not_started");
  assert.equal(a.established, 0);
  assert.equal(a.openQuestions.length, 8);
});

test("an actionable objective, scope, and solution direction supports initial discussion", () => {
  const b = empty();
  b.objective = "Reduce email approvals";
  b.requirements = "Client review and status";
  b.proposedSolution = "A client portal";
  b.provenance.objective = { status: "confirmed", evidence: "Reduce email approvals" };
  b.provenance.requirements = { status: "manual", evidence: "Edited in project brief" };
  b.provenance.proposedSolution = { status: "suggested", evidence: "We need approvals" };
  const a = assessHandoff(b);
  assert.equal(a.status, "ready_for_discussion");
  assert.equal(a.established, 3);
  assert.equal(a.confirmed, 1);
  assert.equal(a.edited, 1);
  assert.equal(a.suggested, 1);
  assert.ok(a.reviewSuggestions.some(item => item.key === "proposedSolution"));
  assert.ok(a.openQuestions.some(item => item.key === "budget"));
});

test("suggested objectives or essential features never count as accepted facts", () => {
  const b = empty();
  b.objective = "Grow 50%";
  b.requirements = "Add payments";
  b.service = "AI MVP & SaaS builds";
  b.provenance.objective = { status: "suggested", evidence: "Maybe growth" };
  b.provenance.requirements = { status: "confirmed", evidence: "Add payments" };
  assert.equal(assessHandoff(b).status, "in_progress");
  b.provenance.objective.status = "confirmed";
  b.provenance.requirements.status = "suggested";
  assert.equal(assessHandoff(b).status, "in_progress");
});

test("unknown and placeholder text remains an open decision", () => {
  const b = empty();
  b.budget = "not sure";
  b.timeline = "TBD";
  b.objective = "Improve approvals";
  const a = assessHandoff(b);
  assert.equal(a.established, 1);
  assert.ok(a.openQuestions.some(item => item.key === "budget"));
  assert.ok(a.openQuestions.some(item => item.key === "timeline"));
});

test("manual clears remain absent; manual edits are distinguished", () => {
  const b = empty();
  b.budget = null;
  b.provenance.budget = { status: "manual", evidence: "Edited in the project brief" };
  b.timeline = "Six weeks";
  b.provenance.timeline = { status: "manual", evidence: "Edited in the project brief" };
  const packet = createHandoffPacket(b, date);
  assert.equal(packet.fields.find(x => x.key === "budget")?.status, "not_established");
  assert.equal(packet.fields.find(x => x.key === "timeline")?.status, "manual");
});

test("Markdown is shareable and labels uncertainty without inventing commitments", () => {
  const b = empty();
  b.objective = "Automate manual lead triage";
  b.proposedSolution = "Basic qualification workflow";
  b.provenance.objective = { status: "confirmed", evidence: "Automate manual lead triage" };
  b.provenance.proposedSolution = { status: "suggested", evidence: "manual triage" };
  const md = formatHandoffMarkdown(createHandoffPacket(b, date));
  assert.match(md, /Business objective[\s\S]*Confirmed by visitor/);
  assert.match(md, /Proposed solution[\s\S]*Suggested; needs review/);
  assert.match(md, /formal quotation/);
  assert.match(md, /does not submit an enquiry or reserve a consultation/);
  assert.doesNotMatch(md, /hello@digitalprodigy|booked for Tuesday/);
  assert.match(md, /## Open decisions/);
});

test("visitor-supplied Markdown and HTML are escaped in export", () => {
  const b = empty();
  b.objective = "# Priority\n<script>alert(1)</script> **urgent** [Click](bad)";
  const md = formatHandoffMarkdown(createHandoffPacket(b, date));
  assert.doesNotMatch(md, /<script>/);
  assert.match(md, /&lt;script/);
  assert.ok(md.includes("\\# Priority"));
  assert.ok(md.includes("\\*\\*urgent\\*\\*"));
  assert.ok(md.includes("\\[Click\\]"));
});

test("JSON exports only the chosen brief, not transcript or native session identities", () => {
  const b = empty();
  b.budget = "£7000";
  b.provenance.budget = { status: "manual", evidence: "Edited in the project brief" };
  const packet = createHandoffPacket(b, date);
  const json = formatHandoffJSON(packet);
  const output = JSON.parse(json);
  assert.equal(output.generatedAt, "2026-10-31T12:00:00.000Z");
  assert.equal(output.fields.find((x: { key: string }) => x.key === "budget").value, "£7000");
  assert.equal(output.fields.find((x: { key: string }) => x.key === "budget").status, "manual");
  assert.equal(output.schemaVersion, 1);
  assert.ok(!("messages" in output));
  assert.ok(!("sessionId" in output));
  assert.ok(!("conversationId" in output));
});

test("no user content causes automatic sharing or a fake lead submission", () => {
  const b = empty();
  b.nextStep = "Book a call";
  const packet = createHandoffPacket(b, date);
  assert.match(packet.notice, /not a formal quotation, booking/);
  assert.equal(packet.status, "in_progress");
  assert.ok(packet.fields.every(x => !x.value?.includes("mailto:")));
});

test("handoff preparation does not mutate the authoritative brief", () => {
  const b = empty();
  b.objective = "Launch an MVP";
  const original = JSON.stringify(b);
  createHandoffPacket(b, date);
  assert.equal(JSON.stringify(b), original);
});

test("exported filenames are deterministic and file-extension constrained", () => {
  assert.equal(handoffFileName("md", date), "syntra-project-brief-2026-10-31.md");
  assert.equal(handoffFileName("json", date), "syntra-project-brief-2026-10-31.json");
});
