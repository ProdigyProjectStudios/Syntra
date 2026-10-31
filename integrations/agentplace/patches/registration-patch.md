# Agentplace integration registration patch (platform-owned seams)

The files below are Agentplace runtime infrastructure. This export does not mirror them. Apply only the following Syntra-specific edits to the original Agentplace project; keep surrounding code and security/session controls intact.

## 1. Server startup: `agent-dev-server/src/server.ts`

Add the Syntra router imports alongside the existing router imports:

```ts
import { createSyntraRouter } from './trpc/routers/syntra.router.ts';
import { createAppRouter } from './trpc/router';
```

In `Server.start()`, immediately after creating the platform router, build the Syntra router from the platform's storage factory and compose the app router:

```ts
const platformRouter = createPlatformRouter({ container: this.container, sessionManager });
const syntraRouter = createSyntraRouter(storageFactory);
const appRouter = createAppRouter(platformRouter, syntraRouter);
```

Retain the existing transport registration that serves `appRouter`; do not replace request/session infrastructure.

## 2. tRPC composition: `agent-dev-server/src/trpc/router.ts`

Extend the existing `createAppRouter` function's typed inputs and router map only:

```ts
import type { createSyntraRouter } from './routers/syntra.router.ts';

export function createAppRouter(
  platformRouter: ReturnType<typeof createPlatformRouter>,
  syntraRouter: ReturnType<typeof createSyntraRouter>,
) {
  return createRouter({
    platform: platformRouter,
    syntra: syntraRouter,
  });
}
```

## 3. Agent tool registry: `agent-dev-server/src/bl/messaging/tool-registry.factory.ts`

Add the custom tool import:

```ts
import { UpdateSyntraBriefTool } from '../tools/impl/update-syntra-brief.tool.ts';
```

Within the platform-tool construction method, next to the existing `FilesystemTool` registration, add it only when a trusted session key is present:

```ts
add(new FilesystemTool({ storageFactory, sessionKey }));
if (sessionKey) {
  add(new UpdateSyntraBriefTool({ storageFactory, sessionKey }));
}
```

Do not accept session identity from tool input or browser JSON; `UpdateSyntraBriefTool` obtains identity from the trusted host state.

## 4. Client surface registry

The Syntra-specific view host and `AGENT_SURFACE_COMPONENTS` map are included in this export under `agent-dev-client/src/app/agent/surfaces/`. Merge `SyntraDashboard` into the existing surface component registry rather than replacing other registered surfaces.

## 5. Stage viewport interface

The included `SyntraViewportContext.tsx` is the small Syntra-specific control interface used by the dashboard host. Supply `{ expanded, setExpanded }` from the platform stage's existing expansion state. Do not copy or replace stage, scrolling, or canvas internals.
