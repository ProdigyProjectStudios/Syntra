import test from "node:test";
import assert from "node:assert/strict";
import { verifyEvidenceAnalysis, type EvidenceAnalysis, type EvidenceInput } from "./evidence-ai";

const input: EvidenceInput = {
  decision: "Should the support workflow be automated?",
  sources: [
    { id: "operations", title: "Operations note", text: "Routine account questions are answered manually today. The team has not measured weekly volume or response quality yet. An initial pilot should stay internal." },
    { id: "policy", title: "Policy note", text: "Exception decisions require a named human approver before any response is sent. Staff may prepare a draft, but the system may not send an exception decision." },
  ],
};

function draft(assessment: EvidenceAnalysis["claims"][number]["assessment"], citations: EvidenceAnalysis["claims"][number]["citations"]): EvidenceAnalysis {
  return {
    headline: "Review the proposed support pilot",
    stance: "TEST",
    revisedDecision: "Test draft responses for routine account questions with human review.",
    rationale: "The source material suggests a narrow pilot while questions remain open.",
    claims: [{ statement: "Routine questions are handled manually", assessment, explanation: "The operations note describes the current manual process.", citations }],
    gaps: ["Weekly volume remains unmeasured", "Response quality needs a baseline"],
    nextValidationStep: "Measure one week of routine requests and review staff approvals.",
  };
}

test("retains only a real excerpt and preserves its exact source text", () => {
  const result = verifyEvidenceAnalysis(input, draft("SUPPORTED", [{ sourceId: "operations", quote: "Routine account questions are answered manually today." }]));
  assert.equal(result.claims[0].assessment, "SUPPORTED");
  assert.equal(result.claims[0].citations[0].quote, "Routine account questions are answered manually today.");
  assert.equal(result.stance, "TEST");
});

test("forged citations cannot produce a supported claim or a test recommendation", () => {
  const result = verifyEvidenceAnalysis(input, draft("SUPPORTED", [{ sourceId: "operations", quote: "The team reduced handling time by 80 percent." }]));
  assert.equal(result.claims[0].assessment, "UNCLEAR");
  assert.deepEqual(result.claims[0].citations, []);
  assert.equal(result.stance, "PAUSE");
  assert.match(result.revisedDecision, /^Pause this decision/);
});

test("one valid claim does not rescue a synthesis contaminated by a forged citation", () => {
  const proposed = draft("SUPPORTED", [{ sourceId: "operations", quote: "Routine account questions are answered manually today." }]);
  proposed.claims.push({ statement: "The pilot already cut handling time", assessment: "SUPPORTED", explanation: "The source supposedly reports measured results.", citations: [{ sourceId: "policy", quote: "The pilot cut handling time by half." }] });
  const result = verifyEvidenceAnalysis(input, proposed);
  assert.equal(result.claims[0].assessment, "SUPPORTED");
  assert.equal(result.claims[1].assessment, "UNCLEAR");
  assert.equal(result.stance, "PAUSE");
  assert.match(result.rationale, /cannot be relied on/);
});

test("a conflict needs two distinct verified excerpts", () => {
  const one = verifyEvidenceAnalysis(input, draft("CONFLICTED", [{ sourceId: "operations", quote: "An initial pilot should stay internal." }]));
  assert.equal(one.claims[0].assessment, "UNCLEAR");
  const two = verifyEvidenceAnalysis(input, draft("CONFLICTED", [
    { sourceId: "operations", quote: "An initial pilot should stay internal." },
    { sourceId: "policy", quote: "Exception decisions require a named human approver before any response is sent." },
  ]));
  assert.equal(two.claims[0].assessment, "CONFLICTED");
});

test("whitespace-only quote differences resolve to the actual source excerpt", () => {
  const result = verifyEvidenceAnalysis(input, draft("SUPPORTED", [{ sourceId: "operations", quote: "Routine account questions are answered\nmanually today." }]));
  assert.equal(result.claims[0].assessment, "SUPPORTED");
  assert.equal(result.claims[0].citations[0].quote, "Routine account questions are answered manually today.");
});
