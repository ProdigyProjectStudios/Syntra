# Solution Blueprint engineering runbook

This milestone extends the existing eight-field brief; it does not replace the
consultation, Azure development voice, native AgentPlace adapter or visual design.
The feature starts from release commit `59fca7f85e3d7ce6bc4032c885e9754311f5e9fa`.
Validated implementation: [`3e15273b8b2b86132badfd58f0a220e9978b4943`](https://github.com/ProdigyProjectStudios/Syntra/commit/3e15273b8b2b86132badfd58f0a220e9978b4943)
on `feature/syntra-solution-blueprint`, reviewed 1 November 2026.
See [the proof register](PROOF-REGISTER.md) before making public capability claims.

## Shared deliverable and specialist responsibilities

The Blueprint follows the current consultation and brief. Its ten sections cover
objectives/problems, service fit and published evidence, architecture/data flows,
integrations, automation workflows, roadmap, security/reliability risks, trade-offs,
business-value scenarios, and unresolved decisions/next steps.

Syntra qualifies the business goal and coordinates the next useful question.
Kryon, the Technical Architect, develops system components, data boundaries,
integration dependencies, security and phased delivery choices. Nyx, the Automation
& Workflow Specialist, develops triggers, actions, exceptions, human approval and
measurable outcomes. Each contributes to the same history, brief and Blueprint.
Changing perspective must preserve response depth, corrections and session identity.
Native voice profiles remain capability-gated by the actual AgentPlace host.

Items distinguish confirmed facts, recommendations, assumptions and manual edits.
Confirmation requires supplied visitor evidence; an architecture proposal is not
an established property of a customer's systems. Published portfolio references
support relevance, not promised results. Numeric value scenarios require supplied
figures or explicit assumptions and transparent arithmetic.

Corrections use version checks. Regeneration preserves manual content and recorded
removals; changing source facts can mark older contributions as needing review.
Version history keeps the five most recent meaningful revisions with changed
sections and bounded before/after excerpts. It is an activity history, not an
assertion that historical document snapshots can be restored. A sync that changes
nothing does not create an artificial revision.

The eight canonical brief facts are edited through Project Brief, including when
the visitor selects their edit control from the Blueprint. Other planning notes
can be corrected or removed in place. Corrections are marked **Edited**; removal
records prevent a later matching specialist suggestion from restoring the note.
Concise mode starts sections collapsed, Detailed opens the central planning
sections, and Deep Dive expands every section and structured detail.

Each Blueprint mutation preserves its original request ID and body before it is
sent. An uncertain acknowledgement offers recovery after reload; replay returns
the newest document, preserving later corrections. A rejected version conflict
requires review of the newest version before resubmission. The server retains up
to 128 mutation receipts per consultation; reaching the bound preserves existing
content and retries and returns a clear limit instead of silently pruning retry
safety. A new consultation is available for further work. Item/section/context
limits keep a deliverable bounded and useful on mobile.

An explicitly rejected change, such as exceeding the bounded document size, keeps
the unsaved draft available for correction. It is distinguished from an uncertain
transport outcome, which must recover the original identity. The final serialized
document is checked before persistence, including escaped content and history, so
a permitted edit cannot make the next reload unreadable by crossing the read limit.

## Realistic demonstration

Use an isolated synthetic consultation with a production studio that manages
client approvals in email and spreadsheets. The visitor states that project data
lives in an existing project-management system. Its API access and permitted
integration scopes are still unknown.

1. Explain the bottleneck to Syntra. Supply the approval owner and desired outcome
   when asked, one useful follow-up at a time. Avoid inventing a budget or deadline.
2. Ask Kryon to compare a small approval portal with configuring the existing tool.
   Inspect proposed components/data flows, access boundaries, dependencies and
   phased MVP work. Integration capability should remain subject to verification.
3. Ask Nyx to describe intake, reminders and exception handling. Consequential
   approval decisions must remain with a human; retries and monitoring need owners.
4. Open Solution Blueprint inside Project Brief. Review fact/recommendation labels,
   published evidence, outstanding decisions and the version history.
5. Correct an architecture requirement and remove an unwanted suggestion. Switch
   response depth, add new context and regenerate. Verify the correction and
   removal survive, and stale source-dependent assumptions are marked for review.
6. Refresh and confirm that the same session, perspective, depth and deliverable
   remain. Export Markdown and inspect all ten sections, item status and caveats.
7. Open a separate browser context. Confirm that it cannot read the first
   consultation's messages, brief, Blueprint or corrections.
8. Review the brief and use the existing approved external enquiry route. Exporting
   does not send data; opening the route does not submit or reserve an appointment.

The [exported synthetic example](examples/solution-blueprint-example.md) is a
reviewable result from this browser journey. It includes the preserved reviewer
correction, removal history and a capacity scenario from 100 monthly cases,
30 supplied minutes per case, and an explicitly assumed 10-minute pilot target.
Its visitor details and model replies are fixtures, clearly labelled in the file.

## Validation and operational boundaries

Run the existing domain/voice, TypeScript/build, real local PostgreSQL, deterministic
AgentPlace transfer and browser suites. The Blueprint browser scenario uses the
actual domain transformation logic through a synthetic local runtime. Model replies
are explicitly synthetic; no fixture claims a real model or external delivery.

The database change is additive and must be applied through the reviewed migration
[`20261101_solution_blueprint.sql`](../lib/db/migrations/20261101_solution_blueprint.sql)
in the intended environment before running updated server code. The feature run
must not apply migrations to production. Existing rows must retain their original
messages and derive an initial Blueprint safely without modifying customer text.
Native session storage evolves independently; no Replit database or Azure
credentials are transferred into AgentPlace.

The current native voice completion hook has no verified specialist metadata, so
its Blueprint contributions are attributed to Syntra. Native typed turns retain
their admitted specialist. Azure turns already carry the selected perspective
through the existing consultation API. Exposing more native voice profiles
requires real host capabilities; the transfer does not add a second model or
speech transport.

Use the pinned package manager (`pnpm@10.16.1`) and Node 22.6 or later:

```sh
pnpm test
pnpm test:voice
pnpm typecheck
PORT=5173 BASE_PATH=/ VITE_SYNTRA_VOICE_PROVIDER=azure pnpm build
pnpm test:agentplace
SYNTRA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm test:postgres
SYNTRA_CHECK_URL=http://127.0.0.1:5173 pnpm test:layout
SYNTRA_CHECK_URL=http://127.0.0.1:5173 pnpm test:browser
```

The PostgreSQL runner accepts only a loopback test database and creates/drops an
isolated synthetic schema. Start a local production preview in a separate terminal
before the browser commands:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/digital-prodigy serve
```

Both browser runners reject nonlocal test targets; the workflow runner
also blocks external requests. Playwright can be provided through `SYNTRA_PLAYWRIGHT_MODULE` and an
installed Chromium through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; CI installs its
pinned isolated runner. Results and screenshots go under
`generated-artifacts/frontend-hardening` and `generated-artifacts/browser-workflows`.

## Verified milestone results

At implementation commit `3e15273b`, all of the following passed locally:

| Check | Result and evidence boundary |
| --- | --- |
| Consultation/native/handoff/controller tests | 148 deterministic tests |
| Frontend/audio/API/retry tests | 104 deterministic tests, including eight pending-Blueprint recovery tests |
| PostgreSQL integration | Eight tests on disposable local PostgreSQL 16: concurrency, corrections during model work, replay, rollback, isolation and bounded queries |
| TypeScript and production builds | Full workspace checks passed; these do not certify the real AgentPlace SDK |
| Native transfer | 141 checksums, 137 TS/TSX syntax files, scoped CSS compilation and 45 exported tests; exported cases overlap source tests |
| Browser layout | 320, 375, 390, 768 and 1440 pixels; zero page errors or horizontal overflow, with mobile introduction and control geometry assertions |
| Browser workflow | Nine passing scenarios, zero page errors: guided specialists, depth, correction/rejection/retry, removal, history, export, reload, isolation and Android-style touch interaction |

The workflow browser runs the real UI and shared Blueprint transformations, with
synthetic model replies and local test storage. Android-style coverage uses a
mobile viewport, Android/Chrome user agent, touch emulation and tap events in
desktop Chromium. Its voice selector is a fixture; it provides no new microphone,
audio, acoustic-interruption or physical-device evidence. Prior real cloud voice
evidence remains separately scoped in the proof register.

Measured initial JavaScript changed from **567,889 raw / 184,717 gzip / 158,790
Brotli bytes** at `59fca7f` to **584,118 / 189,939 / 163,112 bytes** at `3e15273b`
using the same build configuration. The feature costs **+2.86% raw, +2.83% gzip
and +2.72% Brotli**. Its initial entry is `index-Ch1Dq57d.js`; Vite reports the
deferred Brief route at approximately 38.82 kB raw / 11.68 kB gzip. These are
bundle-size measurements, not a production or physical-phone latency improvement.

Four engineering responsibilities were integrated and cross-reviewed: conversation
and Blueprint rules; PostgreSQL/native runtime persistence; responsive specialist
and Blueprint UI; and QA/evidence. Review led to stricter numeric evidence,
preserved manual constraints, a final serialized-size guard, safe distinction
between rejected and uncertain edits, and improved narrow-screen composition.

## Remaining live release gates

- **New model behavior:** no configured live model target ran the candidate's new
  specialist instructions or Blueprint deltas. Validate their answer quality and
  structured contributions in a connected development preview before claiming
  real-model success. Scripted replies do not establish that result.
- **Physical Android:** no physical phone, microphone/speaker or OS keyboard was
  available for this run. Complete the human spoken-turn, interruption and device
  lifecycle checks separately; touch emulation is not that verification.
- **Native AgentPlace:** an authenticated running free-Luna host and current SDK
  integration are still required for native persistence, voice, admission and
  publication verification. The deterministic transfer preserves these boundaries
  but does not certify them through fixtures.
- **Deployment:** the user excluded production deployment, production migrations
  and assessment publication from this milestone. Apply the reviewed additive
  migration only through the real deployment process before promoting API code.
  No production resource, Azure infrastructure or paid service was introduced or
  modified during this feature run.

A source change does not prove production behavior. Keep physical Android voice,
actual native Luna/voice, deployment configuration and public assessment publication
as separate gates. Preserve the release's original-request recovery and single
owner of microphone, SDK, audio playback, event listeners and timers.
