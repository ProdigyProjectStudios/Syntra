# Continuous conversation — Pro run 3

31 October 2026. Baseline: `feature/syntra-assessment-voice` at
`4f7fa4c09d828be4b27642255666a4115d9d075d`.

## Result and evidence boundary

A deterministic second-turn failure was reproduced and fixed. The installed
Azure JavaScript SDK can emit multiple phrase results with the same service
request ID. Syntra previously treated that ID as the unique utterance ID:
its adapter suppressed every later partial/final bearing it. A fresh speech-start
could therefore leave the controller waiting for a final that the adapter dropped.

The regression invokes the **installed SDK 1.53.0 phrase parser and RequestSession**,
then feeds its real result objects to the production adapter/controller. Before
the fix, two distinct audio spans produced only one model request. After the fix,
both requests are admitted. This proves the application defect without inventing
unique IDs in the fixture.

The historical [Azure live verification](AZURE-LIVE-VERIFICATION.md) records one
capture-bypassed cloud exchange followed by a failed second input. It did not
record the raw second recognition events/identities. Consequently, this defect
is a supported explanation for the reported behavior, **not a retrospectively
verified diagnosis of that particular cloud run**. The new trace makes that
distinction testable in the credentialed preview.

Run 3 did not capture a human microphone, produce verified audible playback,
contact Azure with a live credential, or measure new cloud latency. The engineering
environment has no Azure/model/database credentials. The connected local browser
is unavailable; the cloud browser shows Replit's signed-out public page. No new
rendered browser/device pass or native Luna execution is claimed.

## Implementation

- `recognition-identity.ts` maps SDK results to local utterance IDs scoped to the
  recognizer epoch. Final audio spans identify duplicate delivery; saying the
  same words later remains a fresh request. No text-similarity filter is used.
- Partial/final correlation survives refined offsets. Azure explicitly warns
  that final offsets may differ from interim offsets. A finalized span does not
  consume later audio merely because an earlier hypothesis overshot its end.
- Delayed older finals remain associated with their pending hypothesis and cannot
  settle a newer partial. Exact duplicate terminal results do not change input state.
- Untimed repeated terminal results can be ambiguous. If they could affect a new
  speech boundary or partial, the adapter invalidates the old epoch before clearing
  provisional recognition, waits for SDK retirement, starts fresh recognition and
  asks the visitor to repeat. It never fabricates a final or resends committed work.
- Ordinary turns keep one continuous recognizer active. There are no per-answer
  microphone restarts, additional Azure services or separate specialist backends.
- Existing controller admission, request receipt recovery, depth, specialist,
  editable brief and persistence contracts remain authoritative. The controller
  receives an optional scalar diagnostic hook; its admission rules are unchanged.
- Committed voice turns now also invalidate the scoped conversation list, as typed
  turns already do. Current transcript and brief invalidation remain intact.
- The neural renderer, palette, typography, layout and orbital animation are unchanged.
  AgentPlace still owns its native model/voice; development Azure code is excluded
  from the deterministic transfer.

The installed SDK's synthesizer cleanup was also inspected. With the existing
`SpeechSynthesizer(config, null)` construction, its cleanup does not close the
microphone's separately owned AudioContext. No source evidence was found for
synthesis completion stopping the microphone; no speculative audio-engine rewrite
was made.

## Structured local diagnostics

The trace is available as Performance API marks named `syntra.voice.event`.
It contains fixed stage names/enums, connection-local counters, timing values and
booleans. It excludes transcripts, spoken text, audio buffers, error strings,
credentials, request/provider IDs and customer/account identifiers. Nothing is
uploaded. Invalid/unknown fields are filtered at runtime, and diagnostic failures
cannot change turn or resource ownership.

Up to 512 recent marks are retained; compaction keeps the newest 256 at a time to
avoid copying the entire trace on every partial. Per-stage counts continue across
compaction. Existing latency metrics retain at most 64 samples per metric. Closing
voice clears active latency correlations while retaining bounded diagnostic marks
for inspection. A new connection has a new local numeric connection counter.

The existing meter adds a sample every five seconds while animation frames run.
It reports live/enabled capture tracks, recognition-clone tracks, meaningful input
activity, controller state, socket status, sent audio-message/byte counts, age of
the last audio send and received service hypothesis/phrase counts. The SDK's public
`Connection` observer is attached once per recognizer. Its callbacks are deactivated
before retirement. Debug protocol observations **never drive application state**.

Audio-message counts include protocol headers and silence. SDK 1.53 sends a 44-byte
WAV header before recorder frames: a plateau at one message/44 bytes is not proof
of microphone capture. Growing counts establish transmission, not intelligible
speech or playback at a physical speaker. No raw message body or header is read
into the trace. Background-tab animation throttling can delay meter samples.

In the authenticated preview's console, inspect the newest connection:

```js
const marks = performance.getEntriesByName('syntra.voice.event', 'mark');
const connection = Math.max(0, ...marks.map(mark => mark.detail?.connection || 0));
console.table(marks
  .filter(mark => mark.detail?.connection === connection)
  .map(mark => ({ atMs: Math.round(mark.startTime), ...mark.detail })));
```

Use the first missing boundary to narrow a stalled second turn:

| Last observed evidence | What to inspect next |
| --- | --- |
| Capture tracks are live but `inputActive` stays false while speaking | Actual browser device, permission, input selection and signal level. |
| Input activity occurs but sent audio counts do not advance beyond the header | Browser-to-SDK recording path; a connected socket alone is insufficient. |
| Audio counts advance, but service hypothesis/phrase counts remain unchanged | Provider recognition/input format, silence, network and socket events. |
| `recognition.service-phrase` occurs without `recognition.final`/`no-match` | SDK parser/lifecycle boundary; inspect fixed canceled/stopped events. |
| `recognition.duplicate` occurs | Check local utterance/offset/duration and provider-ID-reuse flag; no raw provider ID is needed. |
| `controller.final` is accepted but admission is blocked | The snapshot identifies pending input, earlier active/uncertain work, endpoint timer or empty queue. |
| `turn.admitted` occurs without `turn.reply` | Existing consultation API/model and original-request recovery; do not manufacture another request ID. |
| `turn.reply` occurs without synthesis/first scheduled PCM | Playback-blocked reason, synthesis failure, AudioContext state and saved-response recovery. |
| `playback.complete` and Listening occur but the next turn is silent | Follow the new capture/transport/recognition boundaries rather than restarting the model. |

Record the trace immediately after a failure. Do not include token-route responses,
request headers, speech message bodies or full browser/network logs in a shared
diagnostic report. Existing numeric latency definitions and percentile collection
are documented in [Voice intelligence](VOICE-INTELLIGENCE.md) and run 2.

## Automated validation

All **166 individual tests pass**. Root package test commands also pass; individual
files were executed separately to obtain the counts below because this engineering
runner sometimes reports test-file wrappers instead of individual cases.

| Suite | Passing tests |
| --- | ---: |
| Consultation engine | 30 |
| Native runtime/repository | 30 |
| Handoff | 14 |
| Voice controller | 28 |
| Controller diagnostics | 4 |
| Azure adapter/lifecycle/continuous turns | 24 |
| Installed Azure SDK protocol contract | 2 |
| PCM playback | 8 |
| UI connection lifecycle | 5 |
| Local onset detector | 2 |
| Latency/structured diagnostics | 7 |
| SDK connection diagnostic observer | 2 |
| API admission | 3 |
| Speech token broker | 7 |
| **Total** | **166** |

Full workspace TypeScript and production builds pass. AgentPlace validation passes
129 checksums, 125 TS/TSX syntax files, scoped CSS compilation and exported native
tests. Compiled CSS remains 179,500 bytes. This is not a native host SDK/type or
rendered visual equivalence certification. The committed transfer manifest matches
the generated source. All three engineering roles cross-reviewed the same milestone,
including the mapper counterexamples, recovery and diagnostic observer lifecycle.

### Continuous-turn regression observations

- Ten consecutive SDK-parser-shaped recognition turns share one service request ID
  without restarting voice. All ten produce consultation requests and output attempts.
- Duplicate final delivery produces no extra request; identical words at later
  offsets remain valid. All three specialist voice IDs are checked.
- Ten voice turns plus one typed interlude share one in-memory canonical fixture:
  **11 unique request IDs, 22 persisted fixture messages**. This fixture has no
  welcome greeting. Manual brief fields and prior history remain visible to later
  calls. Reopening and one more voice request add exactly one further pair.
- New ASR input during the fifth answer stops its owned PCM source synchronously;
  the next request completes. Late callbacks cannot resurrect retired output.
- Ten separate close/reopen cycles leave no owned live tracks, open contexts,
  active SDK handles, timeout tasks or animation frames in the lifecycle fixture.
- Refined final offsets, overlapping late finals, timed/untimed NoMatch, missing
  finals during local-only interruption, mute/recovery races, uncertain model results,
  microphone loss and late permission grants remain covered.

These tests exercise production orchestration and the installed SDK parser with
fake transport, microphone, audio scheduling, model and storage. They establish
event handling and invariants, **not ten real spoken exchanges or durable cloud
database verification**. No simulated duration is reported as provider latency.

## Live acceptance still required / Pro run 4

Pull the tested commit into the existing credentialed Replit workspace, restart
the configured API/frontend workflows, and open its HTTPS preview in a browser
with real microphone and speaker/headset access. Preserve the existing Secrets.

1. Complete ten real spoken exchanges without leaving voice mode, alternating the
   three specialists after their turns settle. Check natural pauses, repeated words,
   one brief edit and the selected response depth.
2. Verify ten new visitor/advisor pairs in the same persisted consultation and after
   refresh, with no duplicate IDs. A fresh Replit consultation already contains one
   advisor greeting: ten exchanges normally mean **21 total messages**, not 20.
3. Interrupt early/mid/late output on headset and speakers. Verify audible stop, one
   replacement request, no stale audio restart and no echo-driven conversation loop.
4. Confirm typed chat shows the same messages/brief/list count. Close and reopen
   voice; verify the browser microphone indicator/resources release and operation resumes.
5. Capture numeric trace/latency samples for every turn, including any failure.
   Report sample counts and real median/p95 by recognition/model/synthesis/scheduling.
   First scheduled PCM is not physical audible latency. Run actual allow/deny/revoke,
   mute/unmute and token-renewal/device checks before calling voice verified.

If that pass succeeds, continue the mandatory native AgentPlace Luna/voice and real
enquiry-route checks. No publication or merge into `main` occurred in this run.

## Primary technical evidence

- Installed `microsoft-cognitiveservices-speech-sdk@1.53.0`:
  `SpeechServiceRecognizer.processTypeSpecificMessages` constructs hypothesis and
  phrase results with `RequestSession.requestId`; `onPhraseRecognized` advances audio
  bookkeeping, while `onSpeechContext` changes the service request ID.
- [Microsoft: recognition offsets and duration](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-speech-recognition-results)
  explicitly documents that final offsets may change from interim offsets.
- Installed SDK `Connection`, `ConnectionMessage`, `ServiceRecognizerBase.sendWaveHeader`,
  `SpeechSynthesizer`, `SynthesisAdapterBase`, `MicAudioSource` and `AudioStreamFormat`
  were inspected for observer behavior, header-only traffic and audio ownership.
