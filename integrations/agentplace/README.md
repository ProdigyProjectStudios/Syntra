# Agentplace-native Syntra integration source

This directory preserves the Syntra-specific server integration from the Agentplace project. It is an archival source mapping, not a standalone package or a literal checkout of the upstream `feature/syntra-consultation-runtime` branch.

## Source provenance

- Destination base: `feature/syntra-consultation-runtime` at `5a13586b3e34fb3737f9020e97252786bed573b9`.
- Original Syntra frontend baseline already present in this repository: transfer commit `c6b74fcc195135ee2b9227d65fec459638afc586`.
- The Agentplace project owns model execution, native sessions, storage, transport, history, and realtime voice. The code below is an Agentplace-specific consultation adapter; it must not be presented as an upstream Express/Drizzle/OpenAI implementation.

## Included source

- `agent-dev-server/src/bl/syntra/consultation-types.ts` — consultation and brief domain types.
- `agent-dev-server/src/bl/syntra/consultation-engine.ts` — brief evidence/provenance rules and response-depth guidance.
- `agent-dev-server/src/bl/syntra/consultation-repository.ts` — session-scoped durable state, typed-turn admission/idempotency, and voice update handling.
- `agent-dev-server/src/bl/tools/impl/update-syntra-brief.tool.ts` — native tool bridge.
- `agent-dev-server/src/trpc/routers/syntra.router.ts` — session-scoped data procedures.

## Deliberately not copied

This first source export is limited to the Syntra-owned server integration layer. Agentplace transport/session infrastructure, server startup and shared registries, vendored platform libraries, `.env.runtime`, credentials, and other platform-managed files are not included. The client-side compatibility adapter, surface registration/host, adapted UI modules, tests, generated stylesheet, and remaining Agentplace project wiring remain in the Agentplace project; they are not represented by this server-only snapshot. The existing Syntra frontend in `artifacts/digital-prodigy` remains untouched.

The imported server files reference Agentplace-owned APIs (trusted session identity, AgentStorage, tool contracts, and tRPC setup). Those dependencies are intentionally not duplicated here.