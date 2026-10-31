# Syntra × Agentplace integration

This directory is the Agentplace-specific Syntra export: consultation engine and tests, session-scoped tRPC bridge, native surface host, frontend compatibility layer, UI adaptation overlay, stylesheet compiler, and registration notes. It is **not** a standalone app or deployable server.

## Source and boundaries

- Integration branch: `agentplace/syntra-native-integration`, based on `feature/syntra-consultation-runtime` at `5a13586b3e34fb3737f9020e97252786bed573b9`.
- Frontend baseline: `artifacts/digital-prodigy/src` at `c6b74fcc195135ee2b9227d65fec459638afc586`. The Agentplace frontend is an adaptation, not a literal upstream branch checkout.
- Agentplace remains authoritative for identity, transport, authentication, native sessions, transcript/history, storage, model execution and realtime voice. The export does not copy upstream Express/Drizzle, database or OpenAI runtime, and does not modify `main`, `feature/syntra-consultation-runtime` or an Agentplace deployment.

## Export inventory

Server additions include Syntra consultation types/engine/repository and tests under `agent-dev-server/src/bl/syntra/`, the session brief tool, tRPC router, surface contract/registry, and instruction. The brief tool is deliberately flattened to `agent-dev-server/src/bl/tools/update-syntra-brief.tool.ts` from original `src/bl/tools/impl/`; its imports match the exported path.

Client additions include `agent-dev-client/src/app/agent/syntra-app/` (native compatibility bridge, source CSS/compiler and adapted frontend snapshots), the native surface host and registry entry, plus `patches/client-stage/SyntraViewportContext.tsx` and `patches/registration-patch.md`. The remaining 68 changed frontend paths from the baseline are listed in `patches/frontend-overlay/MANIFEST.txt` and represented by four patches: `ui-a-g.patch`, `ui-h-z.patch`, `components-advisor-interactions.patch`, and `support-imports.patch`.

## Assemble the adapted frontend

Run at repository root in a clean staging directory; do not patch the baseline in place. Git is required. `ui-h-z.patch` uses zero-context hunks, so use `--unidiff-zero` for all four patches.

```sh
stage="$(mktemp -d)"
cp -R artifacts/digital-prodigy/src/. "$stage/"
for p in \
  integrations/agentplace/patches/frontend-overlay/ui-a-g.patch \
  integrations/agentplace/patches/frontend-overlay/ui-h-z.patch \
  integrations/agentplace/patches/frontend-overlay/components-advisor-interactions.patch \
  integrations/agentplace/patches/frontend-overlay/support-imports.patch
do
  git apply --unidiff-zero -p1 --directory="$stage" --unsafe-paths "$p"
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

Copy the resulting tree to the Agentplace client's `src/app/agent/syntra-app/frontend/`. Then merge the exported `compat/`, `compile-styles.mjs`, `source.css`, surface host, server files and registrations documented in `patches/registration-patch.md`; preserve existing registry entries. In the Agentplace client dependency environment, run `node src/app/agent/syntra-app/compile-styles.mjs`; it produces generated `styles.generated.ts`, which should not be hand-edited.

Copy the baseline `artifacts/digital-prodigy/src/assets/dp-logo.png` byte-for-byte to `agent-dev-client/static/syntra/assets/dp-logo.png` (the dashboard references `/syntra/assets/dp-logo.png`). Other baseline image assets are not required by the embedded surface.

## Dependencies and limits

Use the existing Agentplace React/bundler versions and check current client/server manifests for missing UI dependencies; do not replace workspace manifests with the upstream package manifest. The transferred frontend uses TanStack Query, Framer Motion, Lucide, Wouter, date-fns, MobX, Radix primitives, vaul, cmdk, class-variance-authority, clsx, Embla, resizable panels, Recharts, input-otp, react-hook-form and Tailwind/PostCSS, plus the source aliases `@syntra/react-day-picker` and `@syntra/tailwind-merge`. CSS compilation needs `postcss`, `@tailwindcss/postcss`, and `tailwindcss`. The bridge relies on existing Agentplace `AgentAuth`, `useMessagingStore`, `trpc`, `AgentStorage`, `useVoiceToggle`, and realtime voice-level services.

The eight-field brief and response depth are session-scoped using trusted host storage; typed-turn changes stage until response completion, with quoted-evidence validation, manual-edit revision protection and request/voice deduplication. Syntra's internal id `1` is an adapter key only. The direction catalogue is presentation content, not availability. No verified contact action, enquiry submission, calendar, booking, quote or outbound handoff exists; Book is informational. Voice binds to host state/captions/transcript/audio levels and does not synthesize speech or resend transcript as typed chat.

This export requires the registration seams and actual Agentplace workspace. No standalone export build or end-to-end integration run has been performed. GitHub Advanced Security scanning is unavailable for this repository; do not interpret that as a clean server-side secret scan.
