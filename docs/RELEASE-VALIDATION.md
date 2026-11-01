# Release validation — 1 November 2026

The hardening branch starts at `fd406a1f218fa5ed9d53a83831e487ec7ae0bd90`.
The repository's previously inspected GitHub workflow was successful; the CI
changes below close coverage gaps rather than claim to repair a failing run.

## Reproducible checks

Use Node 22.6 or newer and the pinned `pnpm@10.16.1`. Install the frozen lockfile,
then run:

```sh
pnpm test
pnpm test:voice
PORT=5173 BASE_PATH=/ VITE_SYNTRA_VOICE_PROVIDER=azure pnpm build
pnpm test:agentplace
SYNTRA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm test:postgres
```

The PostgreSQL runner accepts loopback only and uses a temporary isolated schema.
Use a disposable local database, never a production database. It exercises the
real repository and transaction machinery with synthetic consultation data and
no model credentials.

The separate existing HTTP suite can target an explicitly selected live host:

```sh
SYNTRA_HTTP_LIVE=1 SYNTRA_HTTP_ORIGIN=https://digital-s.replit.app \
  pnpm --filter @workspace/api-server test:http
```

This creates synthetic sessions and uses the existing model allowance. All nine
live scenarios passed against the deployed baseline (10 TAP entries including
their parent). The runner preserves all Set-Cookie headers, including deployment
routing cookies; it does not log credentials or model response bodies. In this
managed Node 24 environment, `NODE_USE_ENV_PROXY=1` was also needed for outbound
fetch. This live suite is deliberately separate from automatic CI.

For browser checks, serve the built app with SPA fallback:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/digital-prodigy serve
```

In another terminal, with Playwright installed outside the application dependency
tree if preferred:

```sh
SYNTRA_CHECK_URL=http://127.0.0.1:5173 pnpm test:layout
SYNTRA_CHECK_URL=http://127.0.0.1:5173 pnpm test:browser
```

`SYNTRA_PLAYWRIGHT_MODULE` accepts an installed Playwright module path, and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing Chromium
binary. CI installs pinned Playwright 1.56.1 in the runner's temporary directory,
runs these checks against the production build, and retains screenshots/JSON as
`browser-validation`. No browser library was added to the shipped application.

## Browser evidence and limits

The Chromium workflow checks use an explicitly synthetic tab-local runtime and
block external requests. They exercise the real rendered application:

- Lost message acknowledgement, reload and original request-ID recovery, with
  two transport attempts and one persisted fixture message pair.
- Original response depth retained through recovery, and no new voice admission
  while the typed request remains uncertain.
- Manual brief correction and Edited provenance surviving reload.
- Denied clipboard recovery plus identical Markdown export containing all eight
  fields and Confirmed/Suggested/Edited labels.
- Invalid enquiry details rejected before the fixture gateway is called.
- Consent invalidated when the brief changes before submission. An uncertain
  admitted enquiry preserves its original ID and reviewed snapshot after reload.
- The approved external contact link contains no brief/contact query parameters,
  opens separately, and uses `noopener noreferrer`.
- Separate browser contexts do not share fixture transcripts or manual edits.

The layout checks cover 320×568, 375×812, 390×844, 768×1024 and 1440×900. They assert
contained layouts, composer visibility, keyboard depth selection, modal focus
containment/restoration, long-caption/control separation and preparation cleanup.
They also count hidden canvas drawing while voice covers the background; the
observed count was zero in each sampled 300 ms interval. Viewport resizing tests
keyboard geometry, not a physical phone keyboard.

The recorded browser workflows and five-width layout pass produced no JavaScript
page errors. Fixtures establish UI orchestration, not model intelligence,
production persistence, real provider delivery, audible audio or physical-device
microphone behavior. No enquiry was submitted to Digital Prodigy.

## Cross-review

The QA role independently reviewed and ran targeted tests for native response-ID
transcript grouping and audio/text deduplication, native receipt/depth persistence,
PostgreSQL lock/transaction cleanup, immutable handoff snapshots and consent,
and gesture-owned audio adoption/abort handling. Voice capture/playback resources
remain owned by one adapter connection. Unadopted output preparation is released
on dismissal/failure, and an audio resume timeout cannot report Listening.

The complete automated counts and production/live voice evidence should be read
with the final release report. In particular, cloud speech with prerecorded WAV
input is useful provider evidence but does not satisfy the ten human-spoken-turn,
physical interruption or AgentPlace-native release gates.

PostgreSQL advisory exclusion covers healthy worker connections. A database
disconnect releases its lock while an already-started model call may still run.
The request remains uncertain and cannot report an unconfirmed commit as success;
the lock is not a durable admission reservation surviving database loss. Deployment
pool capacity and idle transaction timeouts also need live configuration review.

## CI coverage

The workflow now runs on `release/**` pushes and pull requests targeting the
assessment-voice branch or `main`, in addition to the earlier conversion paths.
It includes an ephemeral PostgreSQL 16 service, the existing unit/type/build/native
transfer checks, and both browser suites. Publishing the AgentPlace assessment
remains conditional on actual free-Luna/native-host and physical voice validation.

The first release runs passed the application, PostgreSQL, type, transfer and build
steps, then failed installing Playwright 1.56.1 on the newly advanced
`ubuntu-latest` (Ubuntu 26.04). The workflow now pins supported Ubuntu 24.04 so the
OS and pinned browser tooling remain reproducible.
