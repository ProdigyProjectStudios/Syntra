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

The current feature branch is based on `59fca7f85e3d7ce6bc4032c885e9754311f5e9fa`.
Its implementation and validation references will be recorded here after the
integrated source, real PostgreSQL tests, transfer and browser journey pass. Until
then, Blueprint functionality is a candidate implementation rather than an
approved production claim.

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
- Guaranteed integration compatibility, implementation cost, business savings,
  delivery schedule, appointment availability or successful external submission.
- Provider delivery from a test fixture, or an authenticated runtime from animated
  UI, parser fixtures, Chromium mobile emulation or a successful build alone.

Each new measurement must record its source commit, target, date, sample count,
fixture boundaries and observable result. Diagnostics must exclude credentials,
audio buffers, customer transcripts and identifying account data.
