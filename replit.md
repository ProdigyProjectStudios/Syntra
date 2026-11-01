# Digital Prodigy — AI Build Advisor

_Syntra is an AI decision and build advisor for Digital Prodigy: a visitor can compare three ways to solve a problem in Decision Lab, then turn the best path into a scoped project brief across five experiences — Discover, Decision Lab, Solutions, Project Brief, Book._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/digital-prodigy/` — React+Vite frontend. Palette "Deep Signal" (user-approved direction): deep-space near-black base matching the voice console (#04030B-ish), teal/cyan #67E8F9 primary (brand), electric blue (hsl 217 95% 63%) as the secondary accent. Violet is retired. The voice-mode language runs platform-wide: `NeuralCore` (src/components/neural-core.tsx) is reused at small sizes via `AdvisorOrb` (live or single-frame `still` for many instances), `NeuralField` is a faint ambient network behind every view that reacts to the cursor, clicks and advisor activity, and `ClickBurst` gives every button/link press an implode-then-expand light burst. Keep new UI in this language. Voice console lives in `src/components/voice.tsx`; its `NeuralCore` is a 2D-canvas 3D filament lattice (nodes on folded shells, curved kNN wiring, nucleus rays, synaptic pulses, half-res CSS-blurred bloom). The user wants it to feel like an AI intelligence in its non-physical form (Jarvis/Ultron), not a blob — and calm: structured (nested golden-spiral shells) yet organic (slow lobes), and reading as a sophisticated neural network rather than a uniform "fish net" (sparse weighted synapses, inter-layer axons, hub neurons fanning out; moderate size). Circular silhouette; must feel like imploding and expanding at once (counter-phase layer breathing + inward/outward mote currents), with slow motion and sparse pulses. Avoid busy flicker or fast reactions to speech. It reads a 0–1 amplitude ref, currently a simulated speech envelope until live audio is wired.
- `artifacts/api-server/src/routes/advisor.ts` — advisor endpoints (conversations, messages, brief, services, contact options, voice sessions)
- `artifacts/api-server/src/lib/advisor-ai.ts` — LLM advisor (gpt-5.6-terra via Replit AI Integrations, JSON-mode replies with brief extraction + suggested next steps)
- `artifacts/api-server/src/lib/opportunity-ai.ts` — stateless Decision Lab analysis with bounded Zod-validated output
- `artifacts/api-server/src/middlewares/visitor-session.ts` — HttpOnly anonymous visitor session; advisor conversations are scoped by a stored hash
- `docs/DECISION-LAB.md` — feature, deployment and privacy gates
- `lib/db/src/schema/{conversations,messages,briefs}.ts` — Drizzle tables
- `lib/api-spec/openapi.yaml` — API contract source of truth; codegen after every change

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Timestamp fields in `openapi.yaml` must use `format: date-time`, or generated Zod response schemas reject Drizzle `Date` objects at runtime (500 ZodError).
- After changing `lib/*`, run `pnpm run typecheck:libs` before leaf artifact typechecks — stale declarations surface as missing `@workspace/db` exports.
- The advisor has no calendar/booking integration by design; it directs visitors to the Contact page. Do not add booking behavior without explicit sign-off.
- Apply `docs/migrations/2026-11-01-conversation-session-scope.sql` before deploying advisor session scoping. Legacy conversations without an owner hash become inaccessible through the visitor API.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
