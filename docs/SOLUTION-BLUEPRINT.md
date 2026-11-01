# Solution Blueprint engineering runbook

This milestone extends the existing eight-field brief; it does not replace the
consultation, Azure development voice, native AgentPlace adapter or visual design.
The feature starts from release commit `59fca7f85e3d7ce6bc4032c885e9754311f5e9fa`.
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
pnpm build
pnpm test:agentplace
SYNTRA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm test:postgres
SYNTRA_CHECK_URL=http://127.0.0.1:5173 pnpm test:layout
SYNTRA_CHECK_URL=http://127.0.0.1:5173 pnpm test:browser
```

The PostgreSQL runner accepts only a loopback test database and creates/drops an
isolated synthetic schema. Start a local production preview before the browser
commands. Both browser runners reject nonlocal test targets; the workflow runner
also blocks external requests. Playwright can be provided through `SYNTRA_PLAYWRIGHT_MODULE` and an
installed Chromium through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; CI installs its
pinned isolated runner. Results and screenshots go under
`generated-artifacts/frontend-hardening` and `generated-artifacts/browser-workflows`.

A source change does not prove production behavior. Keep physical Android voice,
actual native Luna/voice, deployment configuration and public assessment publication
as separate gates. Preserve the release's original-request recovery and single
owner of microphone, SDK, audio playback, event listeners and timers.
