# Reconciliation decisions and delivery report

## Compared inputs

- Replit functionality branch: `feature/syntra-consultation-runtime`, `5a13586b3e34fb3737f9020e97252786bed573b9`.
- Native integration export: `agentplace/syntra-native-integration`, `ddec385eef2b76b31974a0c16de57a498d5a22f3`.
- Its adapted frontend baseline: `c6b74fcc195135ee2b9227d65fec459638afc586`.

The native branch added 37 export files rather than replacing the main artifact. Review covered its README, client/server snapshots, engine/repository tests, tool/router, surface contracts/registries, viewport context, source CSS/compiler, frontend manifest and all four overlays. The overlays primarily rewrote imports/portals and aliased dependencies; the direct frontend snapshots were older implementations, not safe replacements for the current artifact.

## Reconciled decisions

| Area | Export issue or useful contribution | Reconciled result |
| --- | --- | --- |
| Domain logic | Parallel copies of the consultation engine/types could diverge | Current `lib/consultation` remains authoritative. Exported wrappers reference generated copies of those exact sources. |
| Brief revisions | Native engine avoided unnecessary manual-save revisions | Adopted idempotent empty/repeated manual saves in the shared engine without weakening provenance or stale-write checks. |
| Frontend | Older provider/pages lacked the newer runtime boundary and persistence behavior | Retained the current artifact; removed obsolete direct snapshots. Export current source with deterministic import/embedding transforms. |
| Native messaging | Completion retries threw errors; responses used fabricated `Date.now()` IDs and omitted the canonical visitor message | `createNativeRuntime` recovers completed receipts and returns the canonical pair. Stable native transcript identities are required. |
| Concurrent admission | Multiple callers could receive an indistinguishable pending reservation and both send | One durable `reserved` response authorizes sending; later pending requests never resend. Other active reservations conflict. |
| Completion trust | Browser could submit the reply used to finalize a turn | Router no longer accepts reply text. Trusted native evidence must prove identity, successful completion and canonical visitor/reply content. |
| Concurrent edits | Re-merging an explicit correction could still supersede an edit made during generation | Reservation/voice snapshots suppress fields edited after staging, including manual clears and provenance changes. |
| Voice brief tool | Deduplication used tool-call IDs and persisted before the native response succeeded | Stable native turn IDs stage voice changes. Native success hooks finalize once; trusted terminal-failure hooks discard. No typed-chat resubmission. |
| Voice UI | Direct host imports replaced the current voice component | Keep current neural interface. Native bindings supply the same typed state/amplitude/transcript/update/error events and stop only voice they started. |
| Session lifecycle | `createSession` only ensured the current native session while UI implied a fresh conversation | Native surface is bound to current host scope; new/cross-session actions explicitly use Agent controls. Replit retains actual conversation creation/history. |
| Session isolation | Current artifact's global keys were insufficient when embedded across changing native scopes | Per-scope cache/storage keys and keyed surface remounts; in-flight native results check identity before and after operations. |
| Native atomicity | In-process locks alone do not protect multiple native workers | Host wrapper requires an injected native atomic gate shared by all consultation writers. No production lock service is fabricated here. |
| Transcript duplication | Native user audio/text could appear twice; captions could become a second source | Canonical response/role grouping, text preference, hidden/reasoning/playback exclusion; captions display only. Optimistic visitor text is hidden if its canonical message has already arrived. |
| Shadow DOM | Old overlay provided useful portal, pointer and CSS isolation adaptations | Added context-aware portals and composed pointer paths without changing default Replit behavior. Preserved viewport, font, layout group and neural visuals. |
| Contact catalogue | Export fixtures still carried unverified contact URLs/emails | Removed duplicated fixtures; generate service presentation content from current catalogue. Contacts remain empty until approved. |
| Bidirectional source | Applying a fixed baseline overlay would overwrite newer frontend behavior | Checksum transfer manifest, clean dedicated staging export, explicit source ownership and host merge checklist. Historical overlays are never executed. |

## Preserved safeguards and boundaries

The Replit backend remains Express/Drizzle with the existing real development AI provider, private browser ownership, hashed capabilities, CSRF checks, no-store responses, row locks, idempotent receipts, bounds, atomic message pairs and manual edit protection. No production migrations, authentication replacement or competing audio/model runtime were introduced.

AgentPlace continues owning native auth/session identity, model choice (including GPT-6 Luna), transcript storage, messaging transport, microphone/playback/interruption and session controls. The export is a set of Syntra-owned seams, not a standalone replacement server.

## Checks

- Shared domain/native adapter regression suite: **43 passing tests**.
- Exported engine/repository suite: **12 passing tests**.
- Live Replit API: **9 passing scenarios**, including real development AI replies, persistence, ownership/CSRF, revision conflicts, concurrent manual edits and replay without rollback.
- Full workspace TypeScript checks and builds passed. A final frontend typecheck/build also passed after optimistic-transcript duplicate suppression.
- Transfer validation checks file SHA-256s, every exported TS/TSX syntax, and scoped Tailwind CSS compilation. This is deliberately **not** represented as full native SDK typechecking.
- Browser checks passed: grounded brief extraction, £7000 manual correction retained through navigation/reload/concise follow-up/history, exactly one message pair per turn, fresh-context session isolation, loaded logos, 375px navigation/editor/composer without horizontal overflow, and honest neural voice preview. Repeated Brief→Book transitions and direct `/book` load rendered the correct handoff view after the existing exit animation; an initial outgoing-page snapshot was not a persistent routing bug.

Existing non-blocking bundle-size and third-party source-map warnings remain. Node's exported-test module-type warning is informational.

## Remaining host-specific work

Implement/register the trusted identity, evidence, atomic gate and lifecycle callbacks specified in [patches/registration-patch.md](patches/registration-patch.md). The export lacks the actual SDK infrastructure and full manifests, so native client/server typechecking, real GPT-6 Luna/voice end-to-end execution and host middleware verification must occur in the actual AgentPlace workspace.

No host implementation paths were guessed when the export did not supply them. The checklist names all known files and explicitly identifies unknown lifecycle/provider/layout locations. No deployment, production schema mutation or merge into any existing branch is part of this delivery.
