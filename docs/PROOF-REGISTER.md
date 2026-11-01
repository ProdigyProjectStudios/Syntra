# Syntra proof register

Reviewed 1 November 2026. This register distinguishes source behavior, automated
fixtures, real cloud-service evidence and physical/native-host verification.
A claim is approved only within its stated scope. It is not permission to publish,
deploy, promise delivery dates or infer a provider receipt.

## Evidence carried forward from the verified release

| ID | Approved statement | Evidence and date | Commit reference | Verification limit |
| --- | --- | --- | --- | --- |
| P01 | Digital Prodigy describes four service areas: AI MVP/SaaS builds, client portals/dashboards, AI automation, and premium product UI. | [Shared business catalogue](../lib/consultation/src/business.ts), [published business site](https://digitalprodigy.dev/); reviewed 2026-11-01. | [59fca7f](https://github.com/ProdigyProjectStudios/Syntra/commit/59fca7f85e3d7ce6bc4032c885e9754311f5e9fa) | These are the business's published offerings, not contractual scope, price or guaranteed capability for a particular project. |
| P02 | FlowCraft AI, Flow Analytics AI, NEXUS AI Assets and AgentOps Command Center are relevant published examples available to ground recommendations. | [Bounded descriptions and source URLs](../lib/consultation/src/business.ts), [source](https://digitalprodigy.dev/); reviewed 2026-11-01. | 59fca7f | Self-published portfolio evidence; no independent customer outcomes, transferable product licence, live-demo availability or ROI is established. |
| P03 | The approved next step opens Digital Prodigy's public enquiry form without transmitting the consultation. | [Contact route](https://digitalprodigy.dev/contact), [handoff contract](../lib/consultation/src/handoff.ts), [release evidence](RELEASE-HARDENING.md); 2026-11-01. | 59fca7f | No enquiry was submitted. Opening the route does not book an appointment or confirm receipt. |
| P04 | The eight-field brief supports persistent corrections and Confirmed/Suggested/Edited provenance, with original request recovery. | [Domain tests](../lib/consultation/src/engine.test.ts), [native tests](../lib/consultation/src/native.test.ts), [browser workflow runner](../scripts/browser-workflow-check.mjs), [release validation](RELEASE-VALIDATION.md); 2026-11-01. | 59fca7f | Browser fixtures are synthetic; the release separately recorded nine live HTTP scenarios against the deployed baseline. |
| P05 | The inspected deployed Azure path completed ten cloud-model replies and ten synthesized PCM starts through ordinary SDK recording in one continuous session. | [Production voice evidence and exact limits](VOICE-PRODUCTION-RECOVERY.md); 2026-11-01. | Deployed source matched [fd406a1](https://github.com/ProdigyProjectStudios/Syntra/commit/fd406a1f218fa5ed9d53a83831e487ec7ae0bd90); later candidate evidence at 59fca7f. | Prerecorded WAV capture in desktop Chromium. Not ten human exchanges or verified audible output; an eleventh shutdown-era request was not inspected. |
| P06 | Phone-interruption handling exposes recovery for post-startup audio suspension and sustained OS microphone muting, preserving uncertain original requests. | [38 adapter regressions](../artifacts/digital-prodigy/tests/azure-voice.test.ts), [release report](RELEASE-HARDENING.md); 2026-11-01. | 59fca7f | Code-level regression evidence. It does not prove these gaps caused the reported Android Chrome failure. |
| P07 | An Android-style touch/user-agent run of the changed candidate completed two cloud-provider playbacks, reopened and retained history after reload. | [Provider report](VOICE-PRODUCTION-RECOVERY.md); 2026-11-01. | 59fca7f | Desktop Chromium emulation, synthetic input and browser asset substitution, not a physical Android phone or source deployment. |
| P08 | The release's shared PostgreSQL gate excludes simultaneous model admission across healthy workers and commits one pair/receipt atomically. | [Real PostgreSQL runner](../scripts/test-postgres.mjs), [integration tests](../artifacts/api-server/tests/postgres-admission.integration.ts); 2026-11-01, five real local PostgreSQL 16 tests passed. | 59fca7f | A lost database connection releases an advisory lock while an external model call may remain active. This is not a durable reservation across crashes. |
| P09 | The native transfer excludes Azure and retains AgentPlace's Luna, identity, session, voice and admission ownership. | [Transfer guide](AGENTPLACE-HANDOFF.md), [registration contract](../integrations/agentplace/patches/registration-patch.md); 2026-11-01. Baseline transfer: 132 checksums, 128 TS/TSX syntax files and 12 exported tests. | 59fca7f | No current AgentPlace SDK/type certification, Luna execution, real native voice or published signed-out assessment URL is established. |
| P10 | Same-config local release builds reduced initial JavaScript by 4.83% raw, 4.64% gzip and 4.62% Brotli while retaining the visual system. | [Measurement method and exact byte counts](FRONTEND-HARDENING.md); 2026-11-01. | fd406a1 → 59fca7f | Bundle-size evidence, not a production speed or phone frame-rate benchmark. Future Blueprint measurements must use the release as their own baseline. |

## Solution Blueprint milestone

Implementation commit: [`3e15273b8b2b86132badfd58f0a220e9978b4943`](https://github.com/ProdigyProjectStudios/Syntra/commit/3e15273b8b2b86132badfd58f0a220e9978b4943),
branch `feature/syntra-solution-blueprint`, based on release `59fca7f`.
All evidence below was collected on 2026-11-01 against that implementation.
These claims describe tested source and local browser behavior, not a production
deployment or real AgentPlace execution.

| ID | Approved statement | Proof | Commit reference | Verification limit |
| --- | --- | --- | --- | --- |
| P11 | A shared ten-section Blueprint evolves from the eight-field brief and bounded specialist contributions, with fact/recommendation/assumption/manual status. | [25 Blueprint domain tests](../lib/consultation/src/blueprint.test.ts), [guided journey](SOLUTION-BLUEPRINT.md), [synthetic exported example](examples/solution-blueprint-example.md). | 3e15273b | Candidate source. The new specialist instructions and structured deltas were not exercised against a live model in this milestone. |
| P12 | Versioned corrections, removals and original mutation identities survive regeneration, receipt replay and concurrent model completion. Definitive rejection preserves the unsaved draft; uncertain acknowledgement preserves the original retry. | [Real PostgreSQL integration tests](../artifacts/api-server/tests/postgres-admission.integration.ts), [native storage regressions](../lib/consultation/src/blueprint-persistence.test.ts), [eight tab-recovery regressions](../artifacts/digital-prodigy/tests/pending-blueprint-operation.test.ts). | 3e15273b | Eight PostgreSQL tests used a disposable local PostgreSQL 16 database. Native storage/provider objects were fixtures. No production migration or native-host concurrency certification. |
| P13 | Supported source behavior includes the guided Syntra → Kryon → Nyx journey, all three response depths, editing, removal, reload, version review, Markdown export and isolated sessions. | [Nine Chromium workflow scenarios](../scripts/browser-workflow-check.mjs), [reviewable exported example](examples/solution-blueprint-example.md). All nine passed with zero page errors. | 3e15273b | Actual rendered UI and portable Blueprint transformations with synthetic model/transport/storage. No real client data, model answer quality, cloud persistence or enquiry delivery is certified by this test. |
| P14 | The Blueprint and specialist controls render without horizontal overflow at 320, 375, 390, 768 and 1440 pixels; the narrow mobile introduction and controls stay usable. | [Five-width layout checks](../scripts/frontend-layout-check.mjs). All five passed with zero page errors; modal focus, depth controls, covered-canvas pause and keyboard geometry checks also passed. | 3e15273b | Desktop Chromium. The ninth workflow additionally used Android/Chrome user agent, mobile viewport, touch emulation and real tap events. It did not use a physical Android keyboard, microphone or speaker; its voice connection was a fixture. |
| P15 | Optional value scenarios derive arithmetic from explicitly supported quantities or labelled assumptions; supplied figures must match their unit and monthly period. Unprovenanced legacy facts stay assumptions requiring review. | [Domain evidence/arithmetic regressions](../lib/consultation/src/blueprint.test.ts), [shared transformation](../lib/consultation/src/blueprint.ts). | 3e15273b | Conservative quote validation is not independent verification of a customer's figures. Capacity scenarios are not guaranteed savings, ROI, studio prices or commitments. |
| P16 | The reproducible native transfer includes Blueprint persistence, specialist guidance and UI while retaining native model/session/voice ownership. | [Transfer guide](AGENTPLACE-HANDOFF.md), [validator](../integrations/agentplace/validate.mjs): 141 checksums, 137 TS/TSX syntax files, scoped CSS compilation and 45 exported tests passed. | 3e15273b | Generated transfer and fixture evidence only. Native voice contributions remain Syntra-attributed because the current trusted hook lacks verified specialist metadata. Free Luna, actual SDK compatibility and realtime host voice still require live verification. |
| P17 | The feature adds a measured, bounded initial JavaScript cost; the Brief/Blueprint route remains deferred. | Same-config local builds: release `59fca7f` **567,889 / 184,717 / 158,790** bytes versus feature **584,118 / 189,939 / 163,112** bytes, respectively raw/gzip/Brotli. Feature entry: `index-Ch1Dq57d.js`. | 59fca7f → 3e15273b | Initial cost is **+2.86% / +2.83% / +2.72%**, respectively. Vite reports the deferred Brief route at approximately 38.82 kB raw and 11.68 kB gzip. This is bundle-size evidence, not a latency, frame-rate, physical-phone or deployed performance improvement. |

The complete local verification at this commit passed **252 deterministic tests**
(148 consultation/native/handoff/controller and 104 frontend/audio/API/retry),
**8 real PostgreSQL tests**, full workspace TypeScript and production builds,
**45 exported native tests**, the transfer checks above, **5 layout widths** and
**9 browser workflows**. Exported tests overlap the source tests; these totals
must not be added together as a count of unique test cases. CI status is recorded
on the review PR separately from these local results.

The four engineering responsibilities produced coordinated results:

- **Conversation and Blueprint:** bounded project-specific contributions, evidence
  checks, safe arithmetic, manual constraint context and readable version history.
- **Runtime and persistence:** existing PostgreSQL/native ownership, atomic updates,
  latest-document replay, bounded receipts and distinct terminal/uncertain failures.
- **Frontend:** adaptive shared perspectives and a responsive Blueprint within the
  existing Brief view, with accessible disclosure, corrections and portable export.
- **QA and integration:** realistic synthetic browser journey, touch emulation,
  database races/rollback/isolation, recovery regressions and explicit proof limits.

Cross-review corrected numeric evidence binding, unprovenanced legacy fact labels,
serialized-document limits, definite-rejection recovery and the mobile Blueprint
introduction before final validation.

Current specialist branding is **Syntra**, **Kryon — Technical Architect**, and
**Nyx — Automation & Workflow Specialist**. Persisted role IDs remain `syntra`,
`technical` and `automation`. They are perspectives over one consultation runtime,
not three independent deployed models. Customer-authored historical transcripts
must never be rewritten as part of a display-name update.

## Claims that remain unapproved

- Successful ten-turn physical Android Chrome conversation, acoustic interruption
  latency, speaker echo rejection, real microphone permission/revocation behavior,
  or physical keyboard behavior.
- Native AgentPlace free-Luna execution, its live specialist voices, or completion
  of the public assessment publication requirement.
- Deployment of this feature branch, a production database migration, changes to
  Azure resources, or a measured provider-latency reduction in this milestone.
- Live generation quality from the new specialist instructions and Blueprint model
  deltas. The candidate has no configured live model target in this environment;
  production still runs the prior implementation and was not deployed as a test.
- Guaranteed integration compatibility, implementation cost, business savings,
  delivery schedule, appointment availability or successful external submission.
- Provider delivery from a test fixture, or an authenticated runtime from animated
  UI, parser fixtures, Chromium mobile emulation or a successful build alone.

Each new measurement must record its source commit, target, date, sample count,
fixture boundaries and observable result. Diagnostics must exclude credentials,
audio buffers, customer transcripts and identifying account data.
