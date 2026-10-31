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
