# Syntra × Agentplace integration

This directory is the Agentplace-specific Syntra export: the consultation engine and tests, session-scoped tRPC bridge, native surface host, frontend compatibility layer, UI adaptation overlay, stylesheet compiler, and exact registration notes. It is **not** a standalone web app or deployable server.

## Source and branch boundaries

- Integration branch: `agentplace/syntra-native-integration`, based on `feature/syntra-consultation-runtime` at `5a13586b3e34fb3737f9020e97252786bed573b9`.
- The source-preserving frontend baseline already in this repository is `artifacts/digital-prodigy/src` at `c6b74fcc195135ee2b9227d65fec459638afc586`. The Agentplace frontend is an adaptation of that baseline, not a literal checkout of the upstream feature branch.
- This export does not import the upstream Express/Drizzle server, database, or OpenAI runtime, and it does not modify `main`, `feature/syntra-consultation-runtime`, or the existing Agentplace deployment.

## Export manifest

### Native Agentplace server additions

- `agent-dev-server/src/bl/syntra/consultation-types.ts`
- `agent-dev-server/src/bl/syntra/consultation-engine.ts` and `consultation-engine.test.ts`
- `agent-dev-server/src/bl/syntra/consultation-repository.ts` and `consultation-repository.test.ts`
- `agent-dev-server/src/bl/tools/update-syntra-brief.tool.ts` — exported from original `agent-dev-server/src/bl/tools/impl/update-syntra-brief.tool.ts`; this inventory copy is intentionally one directory higher and has imports adjusted for its exported location.
- `agent-dev-server/src/trpc/routers/syntra.router.ts`
- `agent-dev-server/src/surfaces/syntra-integration-proof.ts` and `src/surfaces/index.ts`
- `agent-dev-server/src/instruction.md`

### Native Agentplace client additions

- `agent-dev-client/src/app/agent/syntra-app/compat/{api-client.tsx,fixtures.ts,index.ts,types.ts}` — typed bridge to native tRPC, session transcript, and service fixtures.
- `agent-dev-client/src/app/agent/syntra-app/compile-styles.mjs` and `source.css` — reproducible ShadowRoot CSS source/compiler; generated `styles.generated.ts` is intentionally not committed.
- `agent-dev-client/src/app/agent/syntra-app/frontend/` — direct Agentplace snapshots: `App.tsx`; `components/{advisor-ui.tsx,shell.tsx,voice.tsx}`; `lib/{advisor.tsx,portal-context.tsx}`; and `pages/{book.tsx,brief.tsx,discover.tsx,solutions.tsx}`.
- `agent-dev-client/src/app/agent/surfaces/{SyntraIntegrationProof.tsx,index.ts}` — native surface host and component registration.
- The remaining 68 changed frontend paths, relative to the baseline source root, are enumerated in `patches/frontend-overlay/MANIFEST.txt`. Their exact diffs are in `ui-a-g.patch`, `ui-h-z.patch`, `components-advisor-interactions.patch`, and `support-imports.patch`. These preserve portal retargeting for Radix/vaul overlays, relative imports, and the Agentplace-only interaction/entrypoint changes. Unchanged source files remain available in the baseline tree.
- `patches/client-stage/SyntraViewportContext.tsx` and `patches/registration-patch.md` document the narrow platform-owned stage presentation seam. No platform transport or session implementation is copied here.

## Assemble the adapted frontend

Run from the Syntra repository root. Use a clean staging directory; do not patch the original baseline in place:

```sh
stage="$(mktemp -d)"
cp -R artifacts/digital-prodigy/src/. "$stage/"
for p in \
  integrations/agentplace/patches/frontend-overlay/ui-a-g.patch \
  integrations/agentplace/patches/frontend-overlay/ui-h-z.patch \
  integrations/agentplace/patches/frontend-overlay/components-advisor-interactions.patch \
  integrations/agentplace/patches/frontend-overlay/support-imports.patch
do
  patch --batch --forward -p1 -d "$stage" < "$p"
done
mirror=integrations/agentplace/agent-dev-client/src/app/agent/syntra-app/frontend
for f in \
  App.tsx \
  components/advisor-ui.tsx components/shell.tsx components/voice.tsx \
  lib/advisor.tsx lib/portal-context.tsx \
  pages/book.tsx pages/brief.tsx pages/discover.tsx pages/solutions.tsx
do
  mkdir -p "$stage/$(dirname "$f")"
  cp "$mirror/$f" "$stage/$f"
done
```

Copy the completed staging directory to the Agentplace client's `src/app/agent/syntra-app/frontend/`. Then merge the exported `compat/`, `compile-styles.mjs`, `source.css`, surface host, server files, and registrations described in `patches/registration-patch.md`. Preserve existing registry entries rather than replacing an entire platform registry.

Generate the stylesheet in the Agentplace client dependency environment:

```sh
node src/app/agent/syntra-app/compile-styles.mjs
```

This writes `source.css` and `styles.generated.ts`; `SyntraIntegrationProof` imports the generated module. Keep the generated file out of manual edits and rerun the compiler when the source stylesheet changes.

The dashboard logo is referenced at `/syntra/assets/dp-logo.png`. The original asset already exists at `artifacts/digital-prodigy/src/assets/dp-logo.png`; copy it byte-for-byte to `agent-dev-client/static/syntra/assets/dp-logo.png`. The original `dp-og-banner.jpg` and `public/favicon.svg` are also in the baseline, but are not required by the embedded dashboard surface. The banner may be copied if the host later uses it for page metadata.

## Dependencies

Use the Agentplace workspace's existing React and bundler versions; do not replace its package manifest or lockfile with the upstream app's. The complete upstream dependency reference is `artifacts/digital-prodigy/package.json`. The transferred frontend uses React/React DOM, TanStack Query, Framer Motion, Lucide React, Wouter, date-fns, MobX/`mobx-react-lite`, Radix UI primitives, `vaul`, `cmdk`, `class-variance-authority`, `clsx`, `embla-carousel-react`, `react-resizable-panels`, `recharts`, `input-otp`, `react-hook-form`, and Tailwind/PostCSS. The adapter also expects the `@syntra/react-day-picker` and `@syntra/tailwind-merge` aliases used by the source package. `compile-styles.mjs` needs `postcss`, `@tailwindcss/postcss`, and `tailwindcss`.

The native bridge uses the host-provided `AgentAuth`, `useMessagingStore`, `trpc`, `AgentStorage`, `useVoiceToggle`, and realtime voice-level service. These are Agentplace dependencies, not packages to replace with a second transport or an independent session store. Check the current client/server package manifests for any missing UI packages before building.

## Behavior and limits

- Agentplace remains authoritative for identity, model execution, transcript/history, transport, and realtime voice. The Syntra UI's internal id `1` is only an adapter key for the current native session; it does not create a second native conversation. Visitors switch sessions with native Agentplace controls.
- The eight-field brief and response depth are session-scoped through trusted Agentplace storage. The server stages typed-turn changes until the admitted response completes, validates quoted visitor evidence, protects manual edits with revision checks, and deduplicates repeated requests/voice updates.
- The direction catalogue is transferred presentation content, not proof of current service availability. The contact endpoint currently returns no destinations. There is no verified contact action, enquiry submission, calendar, booking, price quote, or outbound handoff; the Book page is informational only.
- The voice UI binds to the host's existing voice state, captions/transcript, and live audio levels. It does not synthesize speech or resend a voice transcript as typed chat.
- The integration requires the native server/client registration seams in `patches/registration-patch.md` and the existing Agentplace runtime. No standalone archive build or end-to-end run has been performed; build/test it after integrating into the actual Agentplace workspace.
- GitHub Advanced Security scanning is unavailable for this repository because it is not enabled. Do not interpret that as a clean server-side secret scan.
