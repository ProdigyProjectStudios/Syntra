# Blueprint development-preview verification

## Source and environment

- Requested baseline: `feature/syntra-solution-blueprint` at
  `a92c3159e5132a4a5e74ab3d65a832dbd49694a3`.
- The existing HTTPS Replit development preview runs the updated frontend and API.
  This is not a new published staging deployment or a production promotion.
- Reviewed `SOLUTION-BLUEPRINT.md` and the database migration README before startup.
  Stopped the old development API, applied the reviewed additive migration only
  through the explicitly selected development database, and verified
  `conversations.blueprint` is nullable JSONB before starting the updated API.
  The application connection and development database both identified `heliumdb`.
  No production migration, data mutation, publish, main merge, or AgentPlace
  deployment was performed.
- Replit development requests use the configured `gpt-5.6-terra` model target.
  Successful real consultation responses establish connectivity to that target;
  they do not independently identify the gateway's underlying model.
  AgentPlace's native model/voice adapters were not replaced.

## Checks

| Check | Result |
| --- | --- |
| Consultation/domain suite | 148 passed |
| Frontend/audio/API suite | 104 passed |
| PostgreSQL integration | 8 passed on disposable loopback PostgreSQL 16 with isolated schema; not the application or production database |
| Workspace TypeScript and production builds | Passed |
| AgentPlace transfer | 141 checksums, 137 TS/TSX files, scoped CSS, 45 exported tests passed; exported tests overlap source cases |
| Browser fixture workflows | 9 passed, including retry, correction, export, isolation and touch scenarios |
| Layout after correction | 320, 375, 390, 768, 1440px passed with zero page errors; added nested Book overflow assertions |

The browser fixture suites use synthetic runtime/model/storage responses and do
not prove connected services. The following browser journey used the real
development API and database without replacing network replies or runtime bindings.

## Connected consultation and Blueprint journey

- Three substantive turns with Syntra, Kryon and Nyx retained the same studio
  approval-project context and the manager's authority. Unknown project-management
  API access remained a verification dependency, not a claimed integration.
- Observed browser message-request durations: 8,386, 10,956 and 9,076ms. These are
  three full request durations, not token latency or a performance benchmark.
- All response depths and all four experiences remained navigable.
- Blueprint generation/sync, a manual architecture correction, removal of another
  note, regeneration and reload preserved the correction/removal. The resulting
  version 7 had 18 planning notes and one edited item.
- Canonical fact editing correctly opened Project Brief. A 12,902-byte Markdown
  download included the correction; removed content appeared only in activity
  history, not as an active recommendation.
- A separate cookie-free context received 404 for the owned consultation.
- Book showed the reviewed handoff and external channel without claiming an
  enquiry submission, availability or appointment confirmation.

## Demonstrated regression and correction

At 320px, Book had nested horizontal overflow despite a viewport-width document.
The dossier summary's intrinsic content width and an unconstrained grid track
could exceed the available space. The correction constrains the track and flex
children, allows compact summary wrapping, and wraps long dossier values.
It preserves the existing layout, neural orb, glass treatment and desktop sizing.
The layout runner now checks nested Book overflow with the dossier expanded;
intentionally clipped, aria-hidden decorative effects are excluded.

The branch's pinned pnpm bootstrap also initially recursed under Replit's newer
preinstalled pnpm. The pinned version was bootstrapped and the original lockfile
reinstalled frozen. No repository pin, dependency version, production configuration
or native runtime was changed to work around it.

## Azure and hardware evidence

The real browser had zero physical audio-input devices. The owned token route
returned 200 in 484ms. Diagnostic authorization completed at 528ms; capture was
requested and failed 59ms later with “Requested device not found,” before ASR.
The UI closed/reopened without adding messages. The three specialist names/roles
were present, but all three live speech paths could not be exercised in that
device-less browser.

A separate live Azure TTS fixture request returned 200 in 1,677ms with a
280,044-byte RIFF PCM response. This establishes real synthesis, not microphone,
session playback or two-way conversation success. Touch taps expanded/collapsed
the dossier and opened/closed the voice dialog.

Physical microphone capture, acoustic interruptions, all three audible voices,
continuous conversation and device recovery remain separate hardware gates.

### Recorded-input connected voice run

The existing `scripts/live-voice-check.mjs` then passed against the HTTPS
development preview with one synthetic recorded utterance supplied through
Chromium's actual `getUserMedia` file-capture device. Neither the SDK, model
responses nor provider transports were mocked. It reached Azure recognition,
one admitted real consultation response, live Azure synthesis and first scheduled
PCM playback, with no page errors or connection failures.

Persistence contained exactly one visitor message, one new advisor message and
the initial advisor greeting: three messages with three unique IDs. The brief
advanced to revision 1. The runner closed voice afterward. It stops when synthesis
completes; it does not prove the entire response was audibly played to a person.

| Metric | One observed sample |
| --- | ---: |
| Voice connection ready | 439ms |
| SDK recognition latency | 573ms |
| Final transcript to admission | 351ms |
| Consultation model round trip | 6,157ms |
| Synthesis start to first scheduled PCM | 1,288ms |
| Final transcript to first scheduled PCM | 7,799ms |

These are one-turn software observations, not a median/p95 distribution or
physical speaker latency. They establish a connected two-way software path, not
ten-turn continuity, all three audible voices or acoustic barge-in. Sanitized
machine evidence is generated locally at
`generated-artifacts/live-voice/report.json`; its recorded synthetic input is not
included in the source transfer.
