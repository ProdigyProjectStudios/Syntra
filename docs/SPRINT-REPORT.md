# Syntra consultation functionality sprint

## Delivered

- Existing frontend preserved: layout, typography, navigation, visual identity and neural animations are retained.
- Portable consultation policy: service matching, natural qualification, one-question guidance, corrections, uncertainty, objection/scope handling and explicit no-invented-business-claims rules.
- Distinct depth policies: a decision in Concise, scope/trade-offs in Detailed, alternatives/dependencies/risks in Deep Dive.
- Eight-field brief extraction with quoted visitor evidence and Confirmed/Suggested/Edited provenance. Literal quotation wrappers are normalized without accepting invented evidence.
- Manual corrections and intentional clears take priority over model suggestions. Revision conflicts preserve the visitor's draft and require reviewing the current revision.
- Atomic message pairs, idempotent request IDs, stale-snapshot conflict detection and preservation of edits made while the model is running. Replaying an old turn returns the latest brief rather than rolling back newer corrections.
- Typed AI provider, repository, browser session/message/brief, voice and booking contracts. The actual React callers now use the replaceable runtime boundary.
- Private browser-scoped sessions, hashed cookie capabilities, origin checks, no-store private responses, bounded inputs/context, per-browser turn limits and redacted logging.
- Honest disconnected voice/booking behavior. Existing animation remains a labelled preview, and unverified contact destinations are omitted.
- Existing logo reused as the built favicon instead of the unrelated template asset. Minimum-width constraints and long-text wrapping fix common composer/message overflow.

## Verification

- `pnpm --filter @workspace/consultation test`: **24 passing domain/regression tests**.
- `pnpm --filter @workspace/api-server test:http`: **9 passing live API scenarios** (10 test-runner entries including the parent suite). These invoke the real development AI provider.
- `pnpm run typecheck`: **passed** across all packages.
- `PORT=5173 BASE_PATH=/ pnpm run build`: **passed** across the workspace.
- Browser verification: grounded objective and £6000 budget extraction; manual £7000 correction survives navigation/reload/later concise reply; history restores the correct thread; isolated browser context cannot see another visitor's sessions; no duplicate turns; voice explicitly disconnected; mobile width 375px and desktop 1280px have no horizontal document overflow; logo images load.
- A separate final screenshot confirmed Solutions cards render, resolving an inconclusive transition-time screenshot from the browser pass.
- Only synthetic test conversations were used. Original visitor records were not deleted.

Non-blocking build warnings remain for the existing frontend's bundle size and third-party source maps. A transient 502 during a deliberate development-server restart cleared on the subsequent request; it did not persist during the browser scenarios.

## Main changed source files

- `lib/consultation/{package.json,tsconfig.json,src/types.ts,src/engine.ts,src/index.ts,src/engine.test.ts}`
- `artifacts/api-server/src/lib/{advisor-ai.ts,advisor-data.ts,consultation-repository.ts}`
- `artifacts/api-server/src/middlewares/privacy.ts`
- `artifacts/api-server/src/routes/advisor.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/tests/http.test.mjs`
- `artifacts/api-server/{package.json,tsconfig.json}`
- `artifacts/digital-prodigy/src/lib/{advisor.tsx,runtime.ts,runtime-hooks.ts}`
- `artifacts/digital-prodigy/src/components/{advisor-ui.tsx,shell.tsx,voice.tsx}`
- `artifacts/digital-prodigy/src/pages/{brief.tsx,book.tsx,solutions.tsx}`
- `artifacts/digital-prodigy/{index.html,package.json}`
- `lib/db/src/schema/{conversations.ts,briefs.ts,turns.ts,index.ts}`
- `lib/api-spec/openapi.yaml` and regenerated `lib/api-client-react/src/generated/*` / `lib/api-zod/src/generated/*`
- Root `tsconfig.json`, `pnpm-lock.yaml`, `replit.md`, integration documentation and project memory.

The GitHub commit's Files changed view is the exact per-file manifest, including generated outputs.

## Integration requirements and limits

Read [AGENTPLACE-INTEGRATION.md](AGENTPLACE-INTEGRATION.md) for the actual source-transfer and adapter contract.

**Not connected or deployed:** AgentPlace GPT-6 Luna/native sessions, native bidirectional voice, and a real booking action. The host's actual SDK and auth/session/event specifications are needed to implement those bindings; none were guessed or silently replaced with a second production runtime.

**Business verification needed:** approved contact channels, pricing policy (if the studio wants one), and production identity, retention/deletion, admin access and distributed abuse controls.

**Legacy records:** retained without deletion. Records without verifiable ownership are no longer exposed by numeric ID or in public history; they require a separately authorized ownership-restoration process.
