# Syntra integration contract

## What remains unchanged

The existing React/TypeScript frontend, route transitions, typography, palette, neural animations and responsive navigation remain the UI. No AgentPlace runtime has been installed or deployed. Replit's OpenAI implementation is **development-only**, not a replacement for AgentPlace GPT-6 Luna or its bidirectional realtime voice/session services.

## Actual source transfer

This repository contains the pnpm workspace, not a standalone HTML export. The frontend is `artifacts/digital-prodigy`; its workspace dependencies must be installed too (`pnpm install --frozen-lockfile`). Import this branch into AgentPlace with access to the private repository. Do not copy rendered HTML or regenerate components from screenshots.

The build command for the frontend is `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/digital-prodigy build`. Set `BASE_PATH` to the real host mount path. The normal Replit managed workflows already provide these variables.

## Browser runtime adapter

Implement `ConsultationRuntime` from `@workspace/consultation` and set `window.__SYNTRA_RUNTIME__` **before** importing/rendering `src/main.tsx`. In an SDK host entry point, statically import the binding module, assign the runtime, then dynamically import the React entry:

```ts
import { agentPlaceRuntime } from './your-agentplace-bindings';
window.__SYNTRA_RUNTIME__ = agentPlaceRuntime;
await import('./main');
```

The binding module must use AgentPlace's actual documented SDK. No guessed AgentPlace API URLs, model aliases, auth tokens or fabricated WebRTC handshakes are included here.

| Boundary | Host responsibility |
| --- | --- |
| `sessions.list/create/get` | Native visitor identity, ownership, session persistence, stable session mapping |
| `messages.send` | Native GPT-6 Luna, shared history, response depth, stable request ID, visitor + advisor messages, brief result |
| `briefs.get/update` | All eight fields, revision checking, provenance and native persistence |
| `services` | Verified studio service catalogue |
| `voice.connect` | Native bidirectional audio, mic permissions, interruption, reconnect, lifecycle and transcript events |
| `booking.contacts` / optional `book` | Verified contact channels; an actual booking action only after connection and explicit consent |

The existing UI uses numeric session/message identifiers. If native AgentPlace IDs are strings, implement a stable server-side mapping; do not derive numeric IDs from a lossy hash. Preserve message roles `visitor` and `advisor`, depth values `concise`, `detailed`, `deep_dive`, and ISO timestamp strings.

`voice.available` must be true **only** after the native adapter is configured. `connect` receives an AbortSignal and must close acquired resources if aborted. Emit `state`, `amplitude` (0–1), `transcript`, `conversation-updated`, and `error` events. The host persists native voice turns and updates the brief before emitting `conversation-updated`. Do not feed final transcripts into `messages.send` a second time: that duplicates turns. `close()` releases mic/audio resources. The UI cleans up on close and ignores late events.

## Portable business logic

`lib/consultation` has no database, Express, React or AI SDK dependency:

- `ConsultationService` coordinates qualification using injected `AIProvider` and `ConversationRepository`.
- `buildSystemPrompt` and `DEPTH_GUIDANCE` provide the qualification and depth policies.
- `parseAdvisorResult` validates structured AI results; unsupported fields are ignored and malformed replies fail explicitly.
- `mergeBrief` grounds field changes in visitor quotes, distinguishes confirmed/suggested/manual, preserves manual clears and corrections, and supports explicit later corrections.
- `manualBrief` performs optimistic concurrency checks.

An AgentPlace **server-side** adapter may instantiate this service with its native repository and GPT-6 Luna provider. Alternatively, the native agent can use the same prompt/result/merge policies in its own trusted runtime and expose `ConsultationRuntime` to this frontend. Do not instantiate another competing AI/voice runtime in the browser. API credentials never belong in browser bundles.

## Replit development implementation

The Express/Drizzle adapter persists atomic pairs of visitor/advisor turns after successful model completion. It uses row locks, a stable request ID receipt, and snapshot conflict detection. It re-reads the latest brief before committing so a manual edit made during AI generation is not overwritten. Failed generation creates no partial database turn. The visitor's failed message remains visible in the UI and retry uses the same request ID.

Browser sessions use a random HttpOnly capability cookie; only its SHA-256 hash is stored against conversations. Cookies expire after 30 days. Private API responses are `no-store`, mutating cross-origin requests are rejected, the API no longer enables wildcard CORS, and logs exclude transcripts/briefs/cookies. This is anonymous browser continuity, **not** cross-device authentication. Clearing cookies loses browser access to those sessions.

### Existing data

Legacy conversations with no owner hash are retained, not deleted or automatically claimed from a numeric localStorage ID. They are excluded from visitor lists/access because their ownership cannot be proven. An authenticated administrator must separately verify ownership before restoring access. Do not expose an unauthenticated "claim by ID" endpoint.

Development schema changes are additive: `conversations.owner_hash`, `briefs.revision`, `briefs.provenance`, and `consultation_turns`. Apply through the project's existing development schema tooling. No startup DDL or automatic production migration scripts are added.

Rate limiting is in-process for the current single-server development runtime (12 turns/minute per browser identity; cookies are not anti-bot protection). A production host must provide distributed abuse controls, verified identity, retention/deletion policy and audited admin access. Sessions are bounded by 240 messages and 120,000 context characters; each message is bounded to 12,000 characters.

### Contacts and booking

The previously hardcoded contact URL/email have not been verified by the business. They are now omitted rather than described as verified or used to send a visitor's brief to an unverified recipient. A real host booking/contact adapter should return only approved destinations. Empty contact lists are a deliberate disconnected state, not fake cards.

## Tests and verification

Run `pnpm --filter @workspace/consultation test`, `pnpm typecheck`, and `PORT=5173 BASE_PATH=/ pnpm build`. Domain tests use deterministic provider/repository doubles to test policy and failure paths; they do not prove that every LLM reply will be correct. The actual Replit API is checked separately for cookies, isolation, persistence, revision conflicts and idempotent retries.

## Required before connecting AgentPlace

1. Access to its supported React hosting/import method and actual SDK documentation.
2. Native session identity and ID mapping, trusted backend hooks/storage, GPT-6 Luna structured-result invocation, and cancellation behavior.
3. Voice SDK event payloads, mic/audio lifecycle and transcript persistence ownership.
4. Business-approved contact channels and, if desired, a connected booking action.
5. Production security/retention decisions. No AgentPlace deployment is part of this sprint.
