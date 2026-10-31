# Narrow Agentplace registration patch

This document records the small native integration seams required by the Syntra-owned source. It is not a copy of Agentplace infrastructure. Keep transport, authentication, session persistence, the messaging pipeline, the native voice engine, and built-in catalog intact. Merge these entries into the current platform files; do not replace existing registries with the Syntra-only examples below.

## Server surface contract

Copy `agent-dev-server/src/surfaces/syntra-integration-proof.ts` to the same path in the Agentplace server project. Merge its `SYNTRA_DASHBOARD` contract into the existing `src/surfaces/index.ts` `AGENT_SURFACE_CONTRACTS` map. The existing tool registry already consumes that map; do not add a second screen transport or custom `RenderSurface` implementation.

## Session brief tool and router

The exported tool is at `integrations/agentplace/agent-dev-server/src/bl/tools/update-syntra-brief.tool.ts`. The original source path was `agent-dev-server/src/bl/tools/impl/update-syntra-brief.tool.ts`; this export is intentionally flattened under `src/bl/tools/`, and its relative imports have been adjusted for that location. Keep it at the exported path unless you also restore the original `impl/` path and its original relative imports.

In `src/bl/messaging/tool-registry.factory.ts`, import the class from `../tools/update-syntra-brief.tool.ts` and add it to the existing per-session tool registry with the current trusted storage factory and session key:

```ts
add(new UpdateSyntraBriefTool({ storageFactory, sessionKey }));
```

Copy `agent-dev-server/src/trpc/routers/syntra.router.ts` to the matching router directory. Extend the existing `src/trpc/router.ts` app-router factory to accept that router and mount it under the `syntra` key. In `src/server.ts`, create it with the existing `AgentStorageFactoryService` and pass it to the app-router factory. The procedures derive scope from trusted `ctx.sessionKey`; never accept a browser-supplied session identity or expose the private record path.

## Client surface and viewport

Copy `agent-dev-client/src/app/agent/surfaces/SyntraIntegrationProof.tsx` and merge its `SyntraDashboard` entry into the existing `AGENT_SURFACE_COMPONENTS` map in `src/app/agent/surfaces/index.ts`. The renderer already reads this registry.

`SyntraDashboard` imports `useSyntraViewport` from `src/app/lib/stage/SyntraViewportContext.tsx`. Copy `patches/client-stage/SyntraViewportContext.tsx` to that path. In the current `StageLayout.tsx`, provide `{ expanded, setExpanded }` around the existing layout, add `data-syntra-viewport={expanded ? 'true' : undefined}` to the stage root, and show an accessible **Agent controls** button when expanded that calls `setExpanded(false)`. Keep the existing rail, dock, stage controller, voice owner, and scroll/session state; the added full-screen mode only changes presentation.

Append these scoped layout rules to the existing `stage-effects.css` (preserve other platform rules):

```css
.stage[data-syntra-viewport="true"] {
  position: fixed; z-index: 1000; inset: 0; display: block;
  width: 100vw; height: 100dvh; min-height: 0; overflow: hidden; transform: none;
}
.stage[data-syntra-viewport="true"] .stage-workspace {
  position: absolute; inset: 0; width: 100%; height: 100%;
}
.stage[data-syntra-viewport="true"] .stage-workspace > :not(.stage-canvas) { display: none; }
.stage[data-syntra-viewport="true"] .stage-canvas {
  width: 100%; height: 100%; overflow: auto; padding: 0;
}
.stage[data-syntra-viewport="true"] .stage-page { width: 100%; height: 100%; padding: 0 !important; }
.stage[data-syntra-viewport="true"] .stage-page > .mx-auto {
  width: 100%; height: 100%; max-width: none; padding: 0;
}
.stage[data-syntra-viewport="true"] .stage-page > .mx-auto > .relative {
  width: 100%; height: 100%;
}
.stage[data-syntra-viewport="true"] .stage-dock,
.stage[data-syntra-viewport="true"] .stage-activity-panel,
.stage[data-syntra-viewport="true"] .stage-activity-trigger {
  display: none !important;
}
.stage-syntra-return { font: inherit; }
@media (prefers-reduced-motion: reduce) {
  .stage-syntra-return { transition: none; }
}
```

## Merge safety

Preserve pre-existing surface contracts/components and router keys. Do not copy Agentplace `src/app/lib/**`, `src/services/**`, messaging or transport source from this export; only apply the context, small `StageLayout` presentation seam, and CSS above. The native host remains authoritative for identity, transcript, voice, and model execution.
