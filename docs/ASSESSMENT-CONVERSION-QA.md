# Assessment conversion QA

## Current milestone — 31 October 2026

The sections below record the earlier Replit pass, not a new browser run. Current source validation is recorded in [Assessment readiness](ASSESSMENT-READINESS.md): 146 passing consultation and voice reliability tests; full TypeScript/build; and 129 transfer checksums with 125 TS/TSX syntax files. The real external enquiry page was inspected during run 1 without submitting a message. The new speech transport and three-specialist interface have not yet passed rendered Replit or live microphone checks. See [Voice reliability — run 2](VOICE-RELIABILITY-RUN-2.md) for fixes, evidence limits and the pending live matrix.

## Earlier Replit checkpoint

Reviewed upstream feature/assessment-conversion at bf9a1f29122893cf21248585215d22943cb57472. The recent Replit mobile composer, welcome-screen and animation-budget refinements were retained rather than overwritten by the older GitHub baseline.

## Fixes

- A session-keyed handoff workspace prevents late promises from showing another consultation’s receipt.
- Validated, consented attempts retain their request ID and reviewed snapshot in tab-scoped session storage. Returning during a request updates its original session; refresh/retry does not manufacture a new intent. Uncertain requests stay locked until the provider confirms them.
- Invalid details or unavailable safe-retry storage cannot contact the gateway. Consent must be the literal boolean true; encoded email headers are rejected.
- Smaller mobile completion dial, wrapping field headers, accessible editor labels and a direct Brief-to-Handoff action.
- Compact, collapsible mobile dossier and meaningful empty state instead of eight empty cards. Mobile action spacing is reduced without removing privacy disclosures.
- Route scroll resets after the frozen outgoing page exits, before the next page enters. Existing chat latest-message scrolling remains owned by the chat stream.

## Automated verification

- pnpm test: 57 passing consultation/domain/adapter tests.
- pnpm --filter @workspace/api-server test:http: 9 passing live API scenarios (10 TAP entries including their parent). Covers real development AI, ownership, CSRF, manual edit/clear conflicts, depth, atomic pairs and lost-response replay.
- PORT=5173 BASE_PATH=/ pnpm build: full workspace TypeScript checks and production builds passed. Final frontend typecheck/build also passed after UI refinements.
- pnpm test:agentplace: 119 transfer checksums, 115 exported TS/TSX syntax files, scoped CSS compilation and 12 exported engine/repository tests passed. The committed transfer manifest was regenerated. This is not a full native SDK typecheck.
- Existing bundle-size and third-party sourcemap warnings are non-blocking.

## Real browser pass

A single persistent testing agent used isolated contexts and synthetic data. The overall pass succeeded:

- A realistic client approvals project received useful role, integration and qualification questions, then concise/deep-dive follow-ups without guaranteed deadlines or fabricated availability.
- All eight brief fields, provenance, a manual budget correction, long wrapping requirements, reload, edit cancellation, history and navigation across all four views were checked.
- Clipboard reads and downloaded Markdown were inspected for all eight labels, manual/suggested/confirmed status, the edited budget and the no-commitments disclaimer. Book exports and denied-clipboard fallback worked.
- Desktop 1440x900, tablet 768x1024, mobile 375x812 and 320x568 had no measured horizontal overflow. Composer reachability, mobile dossier controls and new-chat fit were checked.
- Neural voice preview remained honestly disconnected and closed after its existing exit transition. Native audio was not simulated.
- Actual Replit Book showed an unconnected handoff and no live form, appointments or confirmation.
- Single injected 503s on brief/contact reads recovered through automatic retry without losing the saved brief. Brief placeholders can appear during a retry or route transition; a single transient error does not immediately surface a terminal error message.
- Focused post-fix checks passed: desktop Brief-bottom→Book and Book-bottom→Brief, plus mobile Book-bottom→Brief, all reset main scroll to zero and exposed the correct heading. Returning to Discover still scrolled to the latest reply.

## Conditional enquiry fixtures — not real provider tests

Only an isolated browser’s Vite module response was intercepted to expose a TEST-ONLY gateway; no production source/provider was added. Tests proved: no consent/no call; invalid details/no call; rapid double-click/one in-flight call; a deliberately lost acknowledgement/no false success; safe retry after navigation and refresh with the same ID and details; two transport calls/one effective fixture action; exact fixture reference after acknowledgement; confirmed replay/no new call; and separate session receipts when an older request resolves after switching sessions. The route override was revoked, restoring the real disconnected UI.

## Remaining host requirements and observations

AgentPlace owns Luna, authentication/session identity, realtime audio, server lifecycle and persistent cross-worker gates. Its SDK, model execution, actual audio interruption/reconnect and real enquiry provider cannot be verified in this Replit workspace. A real provider must enforce ownership, current brief revision for new admissions, stored receipt replay and durable idempotency independently of the browser. No deployment, merge, platform infrastructure transplant or fake booking integration was performed.

The catalogue intentionally combines “Client portals & dashboards.” An isolated internal-inventory test retained distinct data, but one generated phrase called it a client portal; this is a non-blocking recommendation-wording observation, not evidence of session leakage.
