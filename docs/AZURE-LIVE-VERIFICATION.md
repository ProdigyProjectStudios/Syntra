# Azure Speech live verification

## Source and scope

- Inspected and loaded `feature/syntra-assessment-voice` at
  `a805f7c7efbc5093218ba1d943cb560550149abf`.
- Read `VOICE-INTELLIGENCE.md` and the existing recognition, controller,
  PCM playback, lifecycle, token broker and transfer boundaries.
- Installed the frozen pnpm lockfile and restarted the managed frontend and API.
- Restored the nonsecret Replit settings after switching branches:
  `AZURE_SPEECH_REGION=uksouth`, `SYNTRA_VOICE_PROVIDER=azure`,
  `VITE_SYNTRA_VOICE_PROVIDER=azure`. The key remains in Secrets.
- Did not rebuild or replace voice, change the visual design, merge any branch,
  deploy, publish, or modify AgentPlace's native runtime.

This report separates actual cloud-service evidence from fixture-based capture
and from physical-device verification. A successful token exchange or synthesis
request alone does not prove a working continuous voice conversation.

## Automated checks

All passed against the reviewed implementation:

| Check | Result |
| --- | --- |
| `pnpm test` | 102 passing consultation, native, handoff and controller tests |
| `pnpm test:voice` | 44 passing adapter, audio, lifecycle, diagnostics, admission and broker tests |
| `PORT=5173 BASE_PATH=/ pnpm build` | Full workspace TypeScript checks and production builds passed |
| `pnpm test:agentplace` | 129 checksums, 125 TS/TSX syntax files, scoped CSS and 12 exported native tests passed |

Build output included nonblocking chunk-size, third-party sourcemap and generated
module-type warnings. These are not evidence of provider or hardware behavior.
The exporter still excludes the Replit Azure directory and runtime composition.

## Actual provider checks

The running application's `/api/voice/config` returned enabled Azure metadata for
`uksouth`. An owned consultation's token exchange returned HTTP 200 in 561 ms.
Neither long-lived keys nor short-lived credentials were printed or committed.

The regional voice catalogue returned HTTP 200 and listed all three configured
voices as female. Actual REST synthesis returned raw 24-kHz, 16-bit mono PCM:

| Voice | HTTP | PCM bytes | Response headers / body complete |
| --- | ---: | ---: | ---: |
| `en-GB-SoniaNeural` | 200 | 158,400 | 590 / 924 ms |
| `en-GB-LibbyNeural` | 200 | 183,000 | 279 / 694 ms |
| `en-GB-BellaNeural` | 200 | 174,000 | 281 / 658 ms |

These are one short fixed phrase per voice, not application turn latency or
listening/quality assessments. Separate browser SDK synthesis requests also
returned PCM for all three voices.

Live token-route negative checks passed: missing voice-request header returned
400, another browser owner's consultation returned 404, cross-origin requests
returned 403, and an invalid consultation ID returned 400.

## Browser evidence

### No physical microphone

The remote browser had no physical audio input. Opening voice initially displayed
`Requested device not found`, without a permission prompt. Real permission
allow/deny, phone microphone capture and speaker behavior were not verified.

### Virtual capture, without bypassing the recorder

A page-only AudioContext virtual microphone carrying Azure-synthesized fixture
speech let the application reach Listening with a real Azure recognition socket.
The app input analyser recorded nonzero audio; both app and SDK contexts were
running. The SDK AudioWorklet loaded without reported processor/module errors.
However, the observer saw no recorder frames or recognition captions/results.

This did not establish a complete microphone-to-recognition path. The cause of
the virtual-capture failure remains unresolved; it is not proof that physical
microphones work, or proof of an application defect.

### One cloud turn with the capture boundary bypassed

For a narrower diagnostic, a **test-only** override of
`AudioConfig.fromStreamInput` supplied an actual Azure SDK
`PushAudioInputStream`, paced with real prerecorded 24-kHz PCM. The Azure
recognizer, consultation model/API, turn controller, synthesis and player were
not mocked. No transcripts, model replies or adapter events were injected.
The app's virtual stream remained present for metering and lifecycle checks.

One complete turn passed:

1. Actual Azure recognition transcribed the invoice-review workflow fixture.
2. Syntra entered its pending-response state and invoked the existing model.
3. The canonical consultation saved exactly one visitor/advisor pair.
4. Actual Azure synthesis delivered PCM; the app entered Speaking and then
   Listening, and measured first playable PCM scheduling.
5. Refresh preserved the same exchange with no duplicate visitor message.

A second, distinct technical fixture produced no second final transcript or
saved exchange. Testing stopped rather than fabricating recognition events.
The cause of this repeated-input failure remains unresolved. Ten continuous
turns, specialist-specific model replies and barge-in were **not** verified.

### Lifecycle, profile UI and layout

- Mute disabled the app-owned capture track and closed its recognizer socket.
- Unmute restored Listening with an enabled live clone and a fresh socket.
- Close ended the app-owned clone tracks. Fixture streams, push stream and
  contexts were explicitly closed, and original browser APIs restored.
- With no pending turn, the rail switched Syntra, technical and automation perspectives while
  remaining Listening. This does not prove three app-generated spoken replies.
- The 375×812 voice layout showed its rail, active identity, guidance and
  controls without obvious overlap. The mobile Discover screenshot also loaded
  normally. This was not an exhaustive device/responsive matrix.
- No enquiry, booking, contact submission or external notification was sent.
- Both isolated development consultations created by these probes were removed
  after testing, including their cascading messages, briefs and turn receipts.
  Existing user consultations were not removed.

## Measured latency

The single capture-bypassed cloud turn produced these actual browser measures:

| Metric | Samples | Observed duration |
| --- | ---: | ---: |
| Azure SDK recognition latency | 1 | 565 ms |
| Final fragment to model admission | 1 | 351 ms |
| Model response round trip | 1 | 4,485 ms |
| Synthesis start to first PCM scheduling | 1 | 1,062 ms |
| Model reply to first PCM scheduling | 1 | 1,065 ms |
| Final transcript to first PCM scheduling | 1 | 5,900 ms |
| Synthesis first byte / finish | 1 each | 1,061 / 1,576 ms |
| Synthesis service / connection / network | 1 each | 602 / 354 / 105 ms |

Connection-ready samples were 370, 382, 458 and 902 ms: median 420 ms,
nearest-rank p95 902 ms, **n=4**, excluding physical permission behavior.

There are insufficient successful turns for meaningful response median/p95
benchmarks. First PCM scheduling is not sound measured at a speaker; recognition
latency does not include all user speech. No barge-in stop sample was recorded.
The model round trip was the largest measured stage in this one turn; no
segmentation thresholds, model policy or audio engine were changed on that basis.

## Still required before claiming continuous voice works

- Human microphone allow/deny and actual capture in the intended HTTPS preview.
- At least ten alternating real spoken turns, pauses and multi-fragment input.
- Explain the failed repeated-input fixture path, or demonstrate that actual
  microphone input works repeatedly through the unchanged recorder.
- Early/mid/late barge-in on headset and speakers; no stale restart or echo loop.
- App-generated replies in all three specialist voices, human listening for
  quality, and preservation of shared history, manual brief edits and depth.
- Multiple-turn transcript synchronization, refresh/reconnect and uncertain-turn
  recovery; autoplay denial, microphone removal and late permission grants.
- An active session past token renewal, rather than relying on unit coverage.
- Multiple real-turn samples for response median/p95 and physical stop latency.
- Separate AgentPlace SDK/Luna/native voice verification in the actual host.

The existing engine was preserved. No confirmed engine defect was fixed or
claimed fixed during this verification; the capture/continuous-turn gap remains
open. This report is not a production-readiness or release approval.
