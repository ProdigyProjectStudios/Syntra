# Assessment readiness — 31 October 2026

Baseline: `feature/assessment-conversion` at `dd977aa9894da38234dca25b1cf74b5294990729`.

## Verified portable implementation

- The current consultation, editable eight-field brief, provenance, response-depth controls and export remain intact.
- The approved public conversion route is [Digital Prodigy's enquiry form](https://digitalprodigy.dev/contact). The live page and its name/email/subject/message controls were inspected on 31 October. No enquiry was submitted and provider delivery is not claimed.
- Development API, generated AgentPlace catalogue/router and both consultation instruction paths now use the same business/contact source.
- The handoff identifies Aaron, explains external form completion and provides a selectable brief when clipboard permission is denied. No brief or personal information is automatically sent by opening the link.
- Native message pairs require a matching response identity. Combined voice/text session limits preserve completed retry receipts. Native action consent requires the literal boolean `true`.

## Validation for this checkpoint

- 166 regression tests passed after Pro run 3: 106 consultation/native/handoff/controller tests and 60 voice transport/SDK/lifecycle/diagnostics/admission/token tests. The suite breakdown, reproduced second-turn defect and ten-turn simulation are in [Continuous conversation — run 3](VOICE-CONTINUITY-RUN-3.md).
- Full workspace TypeScript checks and production builds passed.
- Deterministic transfer: 129 checksums, 125 TS/TSX syntax files and scoped CSS compilation passed. Exported tests were executed; native SDK typing and real audio are separate gates.
- All three engineering roles reviewed the same changes. Existing working branches and the native runtime are preserved.

## Voice and specialist implementation

The replaceable development adapter implements continuous recognition, finalized-turn coalescing, streaming PCM audio, immediate local playback cancellation, live captions, genuine input/output amplitude, microphone mute/cleanup and explicit recovery, including empty audio streams. Uncertain requests retain their original ID, depth and specialist; replaying saved audio does not rerun the model. Long-lived subscription keys remain on the development server and the adapter is excluded from the native transfer.

The voice-only selector contains Syntra, Caelis (technical) and Veyra (automation), with distinct adult British female Azure profiles. Caelis and Veyra are provisional identities. They share one consultation model, canonical conversation and editable brief. Switching is blocked during an unfinished or uncertain turn; switching during playback first stops owned audio. Native specialist controls require real host support and are disabled otherwise.

This is implemented source, not a live audio certification. Model output currently completes before speech synthesis begins. The separate [Azure live report](AZURE-LIVE-VERIFICATION.md) contains one capture-bypassed cloud turn and timings, then a failed second input. Run 3 adds no new cloud latency, subjective quality, speaker echo, physical microphone or token-renewal measurements. Setup, provider evidence and the exact live checks are in [Voice intelligence](VOICE-INTELLIGENCE.md).

## Remaining release gates

1. Pull this feature branch into the real Replit workspace and verify the rendered journey against its live model/database.
2. Generate the transfer, apply only Syntra-owned files, and merge existing host registries per `integrations/agentplace/patches/registration-patch.md`.
3. In AgentPlace, confirm free Luna, trusted session identity/lifecycle hooks and atomic concurrency protection using the actual host SDK.
4. Run native consultation, depth/persistence, actual microphone, spoken response, interruption and reconnect tests.
5. Verify the external enquiry handoff, then publish and test the public URL without sign-in. The official assessment is at <https://agentplace.io/careers/ai-agent-builder>.

The available browser reaches AgentPlace's sign-in screen and Replit's public landing page. It cannot reach the separate local preview server. This workspace has no live development model/database or Azure Speech credentials. Consequently, no new rendered Replit pass, real audio session, native integration, successful enquiry delivery or publication is claimed. The original assessment requires a publicly published AgentPlace agent using free Luna; a passing build or generated transfer is not completion of that requirement.
