# Syntra by Digital Prodigy

Syntra's canonical React/TypeScript frontend and consultation domain are versioned here, developed in the engineering workspace, previewed in Replit, and transferred into AgentPlace without redesigning the interface.

## Start here

- **[AgentPlace handoff guide](docs/AGENTPLACE-HANDOFF.md)** — repository boundaries, validation and native runtime ownership.
- **[Native transfer tools and registration](integrations/agentplace/README.md)** — generate the frontend/domain transfer and register it in the existing host.
- **[Conversion acceptance](docs/ASSESSMENT-CONVERSION-ACCEPTANCE.md)** — consent, provenance, provider receipts and safe retry rules.
- **[Assessment QA](docs/ASSESSMENT-CONVERSION-QA.md)** — completed browser checks and host-specific limitations.
- **[Current assessment readiness](docs/ASSESSMENT-READINESS.md)** — verified conversion route and remaining public-release gates.
- **[Continuous conversation — run 3](docs/VOICE-CONTINUITY-RUN-3.md)** — reproduced second-turn defect, corrected utterance identity, privacy-safe trace and 166 passing tests.
- **[Voice intelligence](docs/VOICE-INTELLIGENCE.md)** — development speech setup, shared specialist context, provider decision and live acceptance checks.
- **[Voice reliability — run 2](docs/VOICE-RELIABILITY-RUN-2.md)** — verified fixes, 146 automated tests, latency diagnostics and credentialed run 3 scope.

## Development

Use pnpm. The frontend is `artifacts/digital-prodigy`, the Replit API is `artifacts/api-server`, and shared contracts/consultation rules are in `lib/consultation`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:voice
PORT=5173 BASE_PATH=/ pnpm build
pnpm test:agentplace
```

Run the frontend and API using their configured Replit workflows. Generated transfer files live under ignored `generated-artifacts/agentplace`; regenerate them from source rather than committing build output.

## Runtime boundaries

AgentPlace retains its native AI, realtime voice and session infrastructure. Development-only services must stay behind typed adapters and must not replace the host runtime. Voice is not operational merely because the neural animation is visible: a real connected audio transport is required. No booking or enquiry may claim success without a verified provider receipt.

The optional Azure development adapter implements continuous speech recognition, streamed PCM playback, interruption and transcript synchronization. It is disabled by default and excluded from the native transfer. Syntra, Caelis and Veyra use one consultation model, conversation and project brief; the two specialist names are provisional. Live provider quality, device behavior and native execution still require the checks in the voice guide.

Do not commit credentials, copy an older exported frontend over the canonical UI, or deploy as part of an export.
