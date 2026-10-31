# Syntra assessment: conversion acceptance criteria

Syntra's conversion path must remain truthful and work inside AgentPlace with Luna.

## Required customer journey
1. Visitor describes a problem in natural language.
2. Advisor recommends a verified Digital Prodigy service and asks one follow-up at a time.
3. The eight-field project brief retains confirmed, suggested, and manually edited provenance.
4. Visitor reviews and explicitly consents before sharing personal information.
5. Visitor chooses an approved contact route, or a connected booking action if one has been configured.
6. Never imply a booking, submission, payment or notification succeeded without a provider receipt.

## Conversion state machine
- `unconfigured`: no approved destination; disable submission and show an honest explanation.
- `ready`: approved destination and consent flow configured.
- `submitting`: prevent duplicate submission with a stable idempotency key.
- `confirmed`: show a reference only after verified provider acknowledgement.
- `failed`: preserve the brief and entered details; offer a safe retry.
- `cancelled`: no external action and no success message.

## Trust and privacy
- No fabricated availability, quotes, calendar slots or prices.
- Never embed private API keys in browser code.
- Validate destination allowlists server-side and require explicit visitor consent.
- Avoid sending an entire transcript when a reviewed project summary suffices.
- Protect anonymous sessions from cross-user access and ensure request retries are idempotent.
- Keep any real booking/CRM connector behind the existing `BookingAdapter` interface.

## Tests to implement
- Unconfigured contact path cannot submit.
- No consent means no submission.
- Duplicate requests produce at most one external action.
- Provider failure never displays success.
- Confirmed acknowledgement displays the exact provider reference.
- Manual edits remain intact after failed submission and navigation.
- Contact details are not included in analytics/logs.

## AgentPlace boundary
Use the native AgentPlace runtime for model, sessions and voice. Replit may test the domain state machine with fakes, but no mock is presented as a production integration.


## Implementation on feature/assessment-conversion

- `lib/consultation/src/handoff.ts` formats a grounded, portable eight-field brief, reports completeness and provenance, validates safe approved channels and defines the consent-gated enquiry coordinator.
- `lib/consultation/src/handoff.test.ts` tests missing consent, unsafe URL schemes, missing provider, duplicate requests, request-ID collisions, receipt verification and failure recovery.
- `artifacts/digital-prodigy/src/pages/book.tsx` provides the premium handoff workspace, live dossier, copy/Markdown actions and conditional consent form.
- `artifacts/digital-prodigy/src/pages/brief.tsx` exposes direct copy and export actions on the editable brief.
- `ConsultationRuntime.booking.submitEnquiry` is OPTIONAL. The UI does not show the submission form unless the host explicitly exposes it. No Replit fake provider or fake appointment exists.
- GitHub Actions runs `pnpm test`, `pnpm typecheck`, `pnpm test:agentplace` and `pnpm build` on this feature branch.

### Required real-provider integration before any live submission

AgentPlace must implement `booking.submitEnquiry` through a verified destination and actual provider API. The trusted server MUST derive the visitor/session ownership, re-read the current reviewed brief and revision from host storage (do not trust the browser's brief payload), require explicit consent, enforce a persistent per-session idempotency key across retries/workers, and return `{ status: "confirmed", reference: "<provider receipt>" }` ONLY after provider acknowledgement. Use server-side credentials and contact-destination allowlists. An unknown provider outcome must not be represented as confirmation.

For providers without an actual action, configure only approved `booking.contacts()` links. Clicking a link opens the external channel; it does not book or send anything on the user's behalf. Until an approved channel exists, the user can copy/export their brief locally.

### Visual QA required

Check at 1440×900 and 375×812, including long requirements, missing objective, editing the brief then returning, keyboard focus, opening approved contact links, reduced motion, clipboard-denied fallback and the disconnected-enquiry state. This branch's source and CI checks are not substitutes for rendered browser or real provider tests.
