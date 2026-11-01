# Evidence Room pilot

Evidence Room at `/evidence` reviews a proposed decision against up to three supplied text excerpts. It returns a revised decision, claim assessments, exact source quotes, conflicts, evidence gaps and one next validation step. It is useful without booking a consultancy call.

## Contract

`POST /api/evidence/analyze`

```json
{
  "decision": "Should we test an AI support assistant for routine policy questions?",
  "sources": [{ "id": "policy-note", "title": "Policy note", "text": "At least 80 characters of supplied source material..." }]
}
```

Decision: 20–2,000 characters. One to three uniquely identified sources, each 80–6,000 characters with a title. Response: `headline`, `stance` (`TEST`, `REVISE`, `PAUSE`), `revisedDecision`, `rationale`, `claims[]` (`statement`, `assessment`, `explanation`, `citations[]`), `gaps[]`, `nextValidationStep`. Claim assessments are `SUPPORTED`, `CONFLICTED`, or `UNCLEAR`. Each citation contains `sourceId` and `quote`.

The server validates model output with Zod and checks that each returned quote is an exact substring of the supplied source (allowing whitespace differences only, then returning the exact source text). A claim with an invalid or insufficient citation is downgraded to `UNCLEAR`. If any assessed claim fails citation verification, the synthesized recommendation is replaced with a `PAUSE` stance and a source-checking step, even when other claims have valid quotes. This proves that the quote appears in the supplied text, **not** that the source is genuine or the model interpreted it correctly. A human should inspect consequential interpretations.

## Data and use limits

- No Evidence Room input or result is written to the application database. Text is sent to the configured model provider for this request. The frontend keeps the current review only in memory; exporting creates a local Markdown file.
- Import currently accepts `.txt`, `.md`, `.csv`, and `.json` under 20 KB. PDF ingestion, storage, permissioned team workspaces, and source revision history are future work. Paste extracted PDF text if appropriate.
- The public pilot limits a visitor session to four analyses per hour in this API process. This is not distributed cost control. Replace it with a shared limiter and telemetry before public scale.
- The user-supplied sources are treated as data in the model prompt. The route logs only a failure message, not source text. The existing application logging and model-provider retention settings still need review before sensitive use.
- Evidence Room does not browse, fetch source URLs, access internal systems, or certify compliance. Do not use it to make a regulated decision autonomously.

## Integration

The feature files are `artifacts/api-server/src/lib/evidence-ai.ts`, `artifacts/api-server/src/routes/evidence.ts`, and `artifacts/digital-prodigy/src/pages/evidence-room.tsx`. Mount the route under `/api`, register `/evidence` in the app router and navigation, and add this contract to OpenAPI before release. A `syntra.evidence.seed` sessionStorage object containing `decision` can prefill this page from Decision Lab; illustrative sources are then cleared. A review can hand off a bounded `syntra.action.seed` draft to `/action`, or continue in the advisor. A paused review seeds evidence collection with an explicit validation-only constraint. If browser storage is disabled, the handoff asks the visitor to export and paste the review instead.
