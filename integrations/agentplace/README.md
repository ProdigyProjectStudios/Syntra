# Intelligence-tool extension

The current frontend additionally contains Decision Lab, Evidence Room and Action
Studio. The exporter carries their current generated **contract types**, not the
Replit API server, database, Azure credentials or model infrastructure.

Register `window.__SYNTRA_INTELLIGENCE__` before rendering the native frontend.
Its `SyntraIntelligenceAdapter` interface is exported from the transferred
`frontend/lib/intelligence-client.ts`: `opportunity(input)`, `evidence(input)` and
`action(input)` return their corresponding typed results. Connect those methods
to host-owned, validated, admitted handlers. Unbound tools fail explicitly.
The Replit development build retains its existing same-origin API transport.

This extension does not change the native consultation runtime, Luna identity,
voice events, transcript deduplication or host session ownership. Transfer
validation checks syntax/contracts; live host registration still requires
AgentPlace verification.

---

# Syntra: Replit ↔ AgentPlace reconciliation

**Canonical frontend:** `artifacts/digital-prodigy/src`.  
**Canonical domain:** `lib/consultation/src`.  
**Native-only seams:** this directory's `agent-dev-client` and `agent-dev-server`.

Reconciled from Replit `5a13586b3e34fb3737f9020e97252786bed573b9` and AgentPlace export `ddec385eef2b76b31974a0c16de57a498d5a22f3`. The latter adapted frontend came from older `c6b74fcc195135ee2b9227d65fec459638afc586`; it is NOT the frontend source of truth.

## Build a transfer without applying old patches

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:voice
pnpm test:agentplace
PORT=5173 BASE_PATH=/ pnpm build
```

`test:agentplace` invokes `export.mjs`, which builds `generated-artifacts/agentplace/` from the **current** canonical source. It checks transfer hashes, transpiles the exported TS/TSX, compiles isolated CSS and runs the exported engine/repository tests. Generated output is excluded from Git and deployment.

For export only: `node integrations/agentplace/export.mjs [generated-artifacts/name-or-/tmp/name]`. The exporter refuses source/host directories and replaces only its own marked staging output so deleted source files do not linger.

The generated `syntra-transfer-manifest.json` is the exact per-file update list, with source paths and SHA-256 checksums. Copy the generated files to their matching host paths, except registry examples: **merge registry entries, never overwrite native registries**. `styles.generated.ts` is produced by the stylesheet compiler during validation; copy it alongside the frontend. Do not copy `syntax-check/`, tests or the manifest into a live asset directory.

The old `patches/frontend-overlay/*` files are historical review evidence only. **Do not apply them**. The old adapted frontend snapshots were removed; the exporter now generates the complete current frontend instead. Relative imports, standalone shared-domain sources, versioned UI aliases, branded asset path and host-only Vite substitutions are deterministic export transforms, not a visual fork.

## Host registration is still required

See [patches/registration-patch.md](patches/registration-patch.md) for exact host files and contracts. The native SDK infrastructure was not exported and is not transplanted here. Therefore full native SDK typechecking and a real native voice/model end-to-end run must occur in AgentPlace before deployment.

The surface uses the existing ShadowRoot, viewport control, native messaging store and voice owner. The current App supports an injected runtime and memory routing without changing normal Replit navigation. Shadow-root portal support preserves popovers/tooltips; composed pointer paths preserve click bursts. No CSS/layout redesign is included.

## Native ownership and safety

- Native identity, transport, model, transcript persistence, microphone/playback, interruption and session switching remain AgentPlace-owned.
- All calls use `NativePorts` / `ConsultationRuntime`. The frontend never writes a native voice transcript back through typed chat.
- Exactly one durable reservation authorizes a typed send. Pending/uncertain reservations do not resend. Completed retries recover canonical visitor/advisor messages and the latest brief.
- Native success/failure hooks finalize/discard staged fields even if the browser closes. The server independently verifies session, request, response, visitor text and terminal success; browser-supplied reply text is no longer accepted.
- Voice deduplication uses a stable **native turn** ID, not tool-call ID. Voice tool calls stage changes; only the native successful-response hook commits them.
- AgentPlace must supply an atomic per-session gate covering all writers/workers. The host wrapper refuses to run without it; the portable in-process gate is for tests/development only.
- Numeric ID `1` identifies the current native session **inside a scoped surface**. It is never a global session identity. Cache/storage scopes and keyed remounts prevent one native session's data appearing in another.
- New/cross-session actions use Agent controls. The adapter does not call `ensureSession` and pretend it created a fresh transcript. Replit retains real multi-conversation development history.
- The service catalogue remains presentation content, not guaranteed availability. The approved external enquiry route is `https://digitalprodigy.dev/contact`; opening it does not submit the brief or establish a booking. No fabricated calendar or submission receipt is added.
- Development Azure speech files and runtime composition are excluded from the transfer. The shared controller/contracts and specialist metadata are portable; native microphone, playback and model ownership stay with AgentPlace.
- Native specialist switching is capability-gated. Do not advertise the technical or automation voices until the host supplies a real context-preserving profile-change implementation. Historical requests without a specialist remain Syntra.

## Dependency compatibility

Preserve AgentPlace's manifests and React root. Audit against `artifacts/digital-prodigy/package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`, then add only missing compatible dependencies.

The host transfer aliases `@syntra/react-day-picker` to `npm:react-day-picker@^9.11.1` and `@syntra/tailwind-merge` to `npm:tailwind-merge@^3.3.1`, avoiding replacement of host-owned incompatible majors. UI also uses TanStack Query v5, Framer Motion, Lucide, Wouter, date-fns, Radix, vaul/cmdk, form and other existing UI dependencies. The isolated CSS compiler needs Tailwind v4, `@tailwindcss/postcss`, `postcss`, `@tailwindcss/typography`, and `tw-animate-css`; keep the tested dependency lock when possible.

CSS compilation can use `SYNTRA_DEPENDENCY_ROOT=/path/to/client` to resolve installed dependencies from a different staging directory. CSS-only package style exports and Tailwind plugins are resolved explicitly, not assumed to have Node JavaScript entry points.

## Bidirectional update rule

Edit the canonical frontend/domain in the engineering workspace and use Replit for live previews. Edit native bindings/registration in AgentPlace. Bring native changes back into this isolated integration directory, review contract drift, regenerate the transfer and rerun checks. Never merge a host's generated frontend over newer canonical source. Use the transfer manifest to identify source ownership and compare changes.

Nothing here deploys, publishes, modifies the native infrastructure, migrates production storage or merges into `main`.
