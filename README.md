# Syntra by Digital Prodigy

Syntra's canonical React/TypeScript frontend and consultation domain are developed in Replit, versioned here, and transferred into AgentPlace without redesigning the interface.

## Start here

- **[AgentPlace handoff guide](docs/AGENTPLACE-HANDOFF.md)** — repository boundaries, validation and native runtime ownership.
- **[Native transfer tools and registration](integrations/agentplace/README.md)** — generate the frontend/domain transfer and register it in the existing host.
- **[Conversion acceptance](docs/ASSESSMENT-CONVERSION-ACCEPTANCE.md)** — consent, provenance, provider receipts and safe retry rules.
- **[Assessment QA](docs/ASSESSMENT-CONVERSION-QA.md)** — completed browser checks and host-specific limitations.

## Development

Use pnpm. The frontend is `artifacts/digital-prodigy`, the Replit API is `artifacts/api-server`, and shared contracts/consultation rules are in `lib/consultation`.

```sh
pnpm install --frozen-lockfile
pnpm test
PORT=5173 BASE_PATH=/ pnpm build
pnpm test:agentplace
```

Run the frontend and API using their configured Replit workflows. Generated transfer files live under ignored `generated-artifacts/agentplace`; regenerate them from source rather than committing build output.

## Runtime boundaries

AgentPlace retains its native AI, realtime voice and session infrastructure. Development-only services must stay behind typed adapters and must not replace the host runtime. Voice is not operational merely because the neural animation is visible: a real connected audio transport is required. No booking or enquiry may claim success without a verified provider receipt.

Do not commit credentials, copy an older exported frontend over the canonical UI, or deploy as part of an export.
