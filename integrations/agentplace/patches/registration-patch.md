# AgentPlace update checklist

Generate the transfer from the reconciled branch using `pnpm test:agentplace`. This supersedes the older baseline-overlay assembly instructions.

## Copy/update Syntra-owned files

Use `generated-artifacts/agentplace/syntra-transfer-manifest.json` for the exact list. It includes:

### Client
- `src/app/agent/syntra-app/frontend/**` — generated from the current frontend; no old patches.
- `src/app/agent/syntra-app/shared/**` — generated current domain/types/native adapter.
- `src/app/agent/syntra-app/compat/{api-client.tsx,native-bindings.tsx,types.ts,fixtures.ts,index.ts}`.
- `src/app/agent/syntra-app/{compile-styles.mjs,styles.generated.ts}`.
- `static/syntra/assets/dp-logo.png` — original asset, byte-for-byte.
- `src/app/agent/surfaces/SyntraIntegrationProof.tsx`.
- `src/app/lib/stage/SyntraViewportContext.tsx` — context only, no stage implementation.

### Server
- `src/bl/syntra/{consultation-types.ts,consultation-engine.ts,consultation-repository.ts,native-lifecycle.ts}`.
- `src/bl/syntra/shared/**` — generated same domain sources as Replit and client.
- `src/bl/tools/update-syntra-brief.tool.ts` — keep flattened path/imports.
- `src/trpc/routers/syntra.router.ts`.
- `src/surfaces/syntra-integration-proof.ts`.
- Merge the Syntra guidance in `src/instruction.md` with current native instructions.

## Manually merge existing platform files (do not overwrite)

| Exact host path | Required update |
| --- | --- |
| Server `src/surfaces/index.ts` | Merge `SYNTRA_DASHBOARD` contract; keep other contracts. |
| Server `src/trpc/router.ts` | Mount the Syntra router under `syntra`; preserve other routers. |
| Server `src/server.ts` | Call `createSyntraRouter(storageFactory, nativeEvidence)` with the trusted adapter described below. |
| Server `src/bl/messaging/tool-registry.factory.ts` | Register `new UpdateSyntraBriefTool({ storageFactory, sessionKey, runExclusive, voiceTurn })`. Do not use the old two-argument constructor. |
| Existing native messaging/voice lifecycle registration | Register `createSyntraLifecycle(storageFactory, nativeEvidence)` callbacks on existing response-success and terminal-failure events. Actual lifecycle file was not exported; locate it in the current host, not a guessed path. |
| Client `src/app/agent/surfaces/index.ts` | Merge `SyntraDashboard`; preserve other components. |
| Client current `StageLayout.tsx` | Provide viewport state, expanded root attribute and accessible Agent controls escape button. Its full path was not supplied by the export; locate it in the current host. |
| Client current `stage-effects.css` | Preserve the exported scoped viewport rules below; merge rather than replace. Its full path was not supplied. |
| Client existing surface registration/provider boundary | Wrap Syntra with `SyntraNativeIdentityProvider`, using stable native content/response identities and timestamps. Do not fabricate IDs from Date.now, text hashes or filtered array indexes. |
| Client/server dependency manifests | Add only missing dependencies/aliases described in the integration README; do not replace host manifests. |

## Trusted host adapters to implement in the existing host

`NativeTurnVerifier` and `NativeLifecycleEvidence` are exported typed interfaces, not guessed platform API calls:

- `runExclusive(sessionKey, work)` provides an atomic gate shared by every native consultation writer and worker (or an equivalent native transaction). Do not use the test-only in-process gate in a multiworker host.
- `admitted(sessionKey, requestId, responseId)` proves native admission from server-side metadata.
- `completed(sessionKey, requestId, responseId)` reads canonical native history and returns matching identity, final visitor text, final reply and terminal status. Never echo browser fields as proof.
- `voiceCompleted(sessionKey, turnId)` proves the successful response for the stable native voice turn.
- `canDiscard(sessionKey, id, voice)` is true only after terminal failure/cancel or provable non-admission. A timeout or dropped browser connection is not proof.
- `voiceTurn(toolContext)` returns the current native turn ID and final visitor transcript from trusted runner state, not the individual tool-call ID.
- `TranscriptIdentity.identify(content, index)` supplies native stable part ID, response association and ISO timestamp. The `index` is only contextual information, not a substitute for identity. Register a memoized provider value so normal store changes do not replace the runtime.

Associate the visitor and advisor entries of a turn with the same canonical response ID. Recovery now refuses an incomplete or mismatched pair instead of selecting the nearest preceding visitor. Verify this mapping against actual native history, including interleaved voice events.

`typedSucceeded` / `voiceSucceeded` finalize staged changes after native successful completion, then notify existing clients using their normal refresh/event mechanism. `terminalFailure` discards staged work only with trusted evidence. These server hooks must work even if Syntra's browser surface disconnects.

The repository rejects new typed reservations while native voice staging is pending and rejects new voice staging while another typed/voice turn is pending. Completed receipts and same-turn staging remain recoverable. The atomic storage gate and these guards protect staged work, but native voice staging starts inside a tool, after the provider model has already been admitted. The actual host must serialize typed/voice admissions across complete model lifetimes, including the interval before the first tool call. Test both arrival orders and terminal cancellation. Do not release reservations on a browser timeout or assume a storage mutex alone provides this model-lifetime guarantee.

The current native transcript mapper only projects final/native text or visitor audio into the UI; hidden/reasoning/assistant audio playback is excluded. Confirm the host's actual role enum and AgentContent schema at native compile time. If its assistant role has another name, map that in `compat/native-bindings.tsx`, not in the shared UI. Native captions are display-only; never send them to `messages.send`.

The platform must already authenticate and derive `ctx.sessionKey`. A procedure named `publicProcedure` is not proof of trusted authentication: verify the existing middleware derives a non-forgeable native session. Never accept session identity from the request body or expose private record paths.

## Scoped expanded-stage CSS

```css
.stage[data-syntra-viewport="true"] {
  position: fixed; z-index: 1000; inset: 0; display: block;
  width: 100vw; height: 100dvh; min-height: 0; overflow: hidden; transform: none;
}
.stage[data-syntra-viewport="true"] .stage-workspace { position: absolute; inset: 0; width: 100%; height: 100%; }
.stage[data-syntra-viewport="true"] .stage-workspace > :not(.stage-canvas) { display: none; }
.stage[data-syntra-viewport="true"] .stage-canvas { width: 100%; height: 100%; overflow: auto; padding: 0; }
.stage[data-syntra-viewport="true"] .stage-page { width: 100%; height: 100%; padding: 0 !important; }
.stage[data-syntra-viewport="true"] .stage-page > .mx-auto { width: 100%; height: 100%; max-width: none; padding: 0; }
.stage[data-syntra-viewport="true"] .stage-page > .mx-auto > .relative { width: 100%; height: 100%; }
.stage[data-syntra-viewport="true"] .stage-dock,
.stage[data-syntra-viewport="true"] .stage-activity-panel,
.stage[data-syntra-viewport="true"] .stage-activity-trigger { display: none !important; }
.stage-syntra-return { font: inherit; }
@media (prefers-reduced-motion: reduce) { .stage-syntra-return { transition: none; } }
```

Keep the native React root, rail, dock, controller, scroll/session state and StageVoice owner. Do not copy or replace AgentPlace services, transport, auth, messaging infrastructure, SDK or storage implementation from any other environment.

## Required native verification before deployment

Run the actual client/server typechecks/builds in the AgentPlace workspace; verify trusted auth and atomic gate semantics; test browser disconnect during response, replay, cancellation, manual edit during generation, voice interruption/reconnect, session switch and 375px layout. This reconciliation does not claim those unavailable native SDK checks have already passed.
