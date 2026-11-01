# Replit reconciliation and verification — 2026-11-01

The release below was integrated from `feature/decision-lab` without replacing the
newer consultation, provenance, Blueprint, Azure voice or orb implementations.
The following supersedes the original pilot-only deployment notes.

## Shared admission and privacy

- All intelligence routes use the existing `syntra.session` HttpOnly session and
  ownership/origin checks. Existing owned conversations remain accessible to their
  original session. Unowned conversations are not assigned to the next visitor.
- The additive owner-session and shared-usage migrations were applied **only to
  the development database**. The 25 conversations present before migration were
  preserved. Production has not been migrated by these scripts.
- PostgreSQL counters replace the new tools' process-local rate limits. A single
  transaction reserves all counters; exhaustion rolls back the entire reservation.
  Real development PostgreSQL concurrency testing admitted exactly 3 of 8 parallel
  requests at a limit of 3, rejected 5, and confirmed multi-counter rollback.
- Shared daily model limits cover Replit consultation and all three intelligence
  tools: 100 reserved requests and 200,000 conservatively reserved token units by
  default. Non-secret operator overrides are `SYNTRA_AI_DAILY_REQUEST_BUDGET` and
  `SYNTRA_AI_DAILY_TOKEN_BUDGET`; zero disables further calls. SDK retries are
  reserved in advance. Unused reservations are intentionally not refunded.
- This is not a dollar-denominated Azure/AgentPlace spending limit. It does not
  meter native AgentPlace models or Azure speech. Prompts and source excerpts are
  not written into these counters or completion telemetry.

## Actual versus simulated verification

- Live HTTPS browser: Decision Lab and Evidence Room returned 200 using the
  connected `gpt-5.6-terra` model. Recorded provider times were 11.40s and 6.04s.
  Citation text matched the highlighted visitor-supplied excerpt exactly.
- Live Action Studio originally returned 502 because generated output violated
  its schema. The existing prompt now states its field types/bounds explicitly,
  with privacy-safe schema-path diagnostics. Subsequent actual calls returned
  200: an HTTPS API check in 8.79s and browser generation in 10.83s.
- Browser editing, Markdown export, explicit save, refresh/restore and mobile
  overflow checks used a **replay of that actual generated plan**, not a second
  successful live end-to-end plan-editing session. Exact edited owner, acceptance
  criteria and scorecard values were retained.
- The PAUSE branch was checked using an explicitly synthetic review response.
  It hands off evidence collection only, retains the original market and all
  990 characters of supplied constraints, and does not authorize implementation.
  The live Evidence Room result was TEST, not PAUSE.
- Two independent HTTPS browser sessions verified private list/read/edit/voice
  access. A subsequent valid message request from another session returned 404
  before model processing. Cookies were Secure and HttpOnly.
- All seven destinations loaded, unsent chat text survived navigation, and the
  three new pages refreshed at their direct URLs. Desktop and 390px mobile
  checks found no horizontal overflow. Existing orb/layout regressions were
  also checked at the five established responsive sizes.
- No live microphone/audio check was performed in this release verification.

## AgentPlace and publication boundary

The transfer exporter includes current intelligence contract types and a typed
`SyntraIntelligenceAdapter` seam. AgentPlace must register
`window.__SYNTRA_INTELLIGENCE__` with its own opportunity/evidence/action handlers
before enabling those tools. The native export fails explicitly if unbound; it
never silently sends native tool requests to the Replit backend. No native Luna,
voice, transcript or session implementation was replaced.

Production publication remains a user action in Replit. Review and apply the
managed database's **additive schema diff during Publish**, before directing
traffic to the new API. Confirm the new columns/table/indexes and run production
smoke checks afterwards. A successful development migration/build is not evidence
that production has been updated.

---

# Intelligence tools release checks

Implemented flow: Decision Lab (`/lab`) → Evidence Room (`/evidence`) → Action Studio (`/action`). Each tool is also independently usable with illustrative sample inputs. Original constraints are carried into downstream inputs. A paused evidence review routes to evidence collection before implementation.

Evidence Room imports text excerpts (.txt/.md/.csv/.json), validates returned quotations against the supplied text, and shows the cited source. It does not independently establish whether a source or a model's interpretation is true. Invalid citations force a paused review. PDF parsing, connected sources and shared team storage are not included.

Action Studio produces an editable experiment plan and a manually completed scorecard. Save/restore/clear controls persist a draft only when requested, in the current browser. There is no cloud synchronization or external workflow execution.

## Verification on 2026-11-01

- Full workspace typecheck and production build passed.
- Five focused evidence citation tests passed, covering exact/normalized quotes, fabricated or missing citations, and invalid conflict evidence. Tests used dummy provider configuration and made no model request.
- Browser QA with synthetic API fixtures verified evidence rendering, source inspection, Evidence Room → Action Studio handoff, editable owner role, explicit save and restore after refresh.
- Desktop and 390px mobile layout inspected. Existing bundle-size and sourcemap build warnings remain.
- Live model output quality, hosted latency, provider availability and database integration were not tested locally.

## Deployment

Follow `DECISION-LAB.md`: apply the conversation owner migration before deploying the API, verify HTTPS cookies and cross-browser isolation, and review legacy history handling. Test one real request to each of the three model endpoints with approved sample data. Use shared rate limiting and cost telemetry before broad traffic; per-process visitor limits are pilot controls. Review provider data-retention settings before accepting sensitive content. No deployment or database migration was performed during this build.
