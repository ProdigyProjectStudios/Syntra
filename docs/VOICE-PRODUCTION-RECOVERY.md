# Production voice investigation — 1 November 2026

Starting source: `feature/syntra-assessment-voice` at
`fd406a1f218fa5ed9d53a83831e487ec7ae0bd90`. Target inspected:
<https://digital-S.replit.app>.

## What the live checks establish

The public production frontend enables Azure, and its server configuration reports
Azure in `uksouth`. Its deployed JavaScript contains the previous recognition
identity fix. Missing enable flags are not the demonstrated cause of the report.

The existing production server's credentials were used only through its owned
consultation/token route. No subscription key, provider token or session cookie
was printed, committed or placed in diagnostic reports.

| Live check | Result | One observed request |
| --- | --- | ---: |
| Create an isolated synthetic consultation | HTTP 201 | 1,754 ms |
| Owned speech token exchange | HTTP 200 | 593 ms |
| Azure regional voice catalogue | HTTP 200; Sonia, Libby and Bella present | 1,005 ms |
| Azure synthesis of one fixed synthetic phrase | HTTP 200; 154,844-byte RIFF PCM | 1,209 ms |

These are bounded individual service checks, not production latency percentiles.
The actual configured credential, region and synthesis service worked during the
probe. No Azure resource setting, resource tier, network rule, credential or
production deployment was changed. These checks consumed existing speech/model
usage; an exact billing charge is unavailable without account billing access. No
new service or paid tier was introduced. The environment has no Azure management
identity or authenticated Replit deployment access; the public token route does
not authorize account administration.

Chromium's native fake microphone device, through the deployed app's unchanged
`getUserMedia` and installed SDK recorder, established a real Azure recognition
socket and transmitted increasing audio counts: 12,844 → 172,844 → 332,844 bytes
across three five-second capture samples. This is a synthetic microphone input,
not physical hardware. It does establish recorder transmission without the
historical `PushAudioInputStream` bypass. The silent-device probe had no application
page errors and correctly produced no speech transcript.

A separate recorded-speech run uses a real Azure-synthesized test WAV as Chromium's
fake microphone input, repeating the same fixed project phrase at distinct audio
offsets with silence between utterances. This checks repeated-turn transport, not
varied conversation quality. The deployed
recognizer, consultation API/model, database and synthesizer are unmodified.
Interim/final events, replies and playback are not injected. The bounded 310-second run produced **ten model replies and ten actual synthesized
PCM playback starts**, using one continuous recognition session. Nine outputs were
interrupted by the next prerecorded utterance; one reached full playback completion.
There were no application page errors, connection failures or recognition recovery
restarts. A short-lived authorization refresh also completed during the run.

At the captured database snapshot there were **21 unique persisted messages: ten
visitor messages, ten advisor replies and the original advisor greeting**. The WAV
looped at the end and an eleventh utterance had already been recognized/admitted
when the browser closed. Its final persistence was not subsequently inspected.
Therefore this snapshot is not a clean post-reload proof of exactly ten final pairs,
and it must not be presented as passing the full human acceptance matrix.

The run demonstrates multiple real cloud exchanges through the unmodified deployed
software path with synthetic recorded capture. It does not prove the original
customer's browser works or that a human heard the outputs. PCM cancellation was
observed in the software trace, not measured acoustically.

| Recorded live metric | Samples | Median | Nearest-rank p95 |
| --- | ---: | ---: | ---: |
| Consultation model round trip | 10 | 3,379 ms | 9,117 ms |
| Final transcript → first scheduled PCM | 10 | 4,972 ms | 10,796 ms |
| Synthesis start → first scheduled PCM | 10 | 1,217 ms | 1,341 ms |
| SDK recognition latency (includes NoMatch results) | 24 | 417 ms | 940 ms |

The recognition sample set includes silence/NoMatch results and is not a ten-spoken-
utterance latency distribution. First PCM scheduling excludes physical speaker
latency. The measured model stage is the largest component of response wait; no
unmeasured hardware speedup or post-change model latency improvement is claimed.

## Candidate frontend against real providers

The release candidate's built HTML/assets were served only inside an isolated
Chromium request overlay at the production origin. `/api` requests continued to
the actual production API/model/database and Azure Speech. This validates the
changed frontend against those services; it is **not a deployment of the branch**,
and it does not validate the branch's changed backend in production.

With two prerecorded utterances, Concise selected, and a longer pause between
turns, the candidate produced **two completed spoken-audio playbacks**, two real
model replies and five unique persisted messages (two visitor, two advisor and
one greeting). Both visitor messages retained `concise` depth. Closing voice and
reopening in the same page reached a second connected recognition session without
refresh. There were no application page errors. First transcript-to-PCM samples
were 4,999 and 3,765 ms; these two observations are not a performance benchmark.

The candidate harness initially failed its assertion that every speech socket
must close within **one second**, even though all four owned output/SDK audio
contexts were already closed and reopen worked. This was investigated rather
than counted as a clean pass or patched with speculative transport replacement.

A focused follow-up used a silent native synthetic microphone and no model turns.
Both close/reopen cycles completed normal SDK retirement and closed all sockets:

| Focused lifecycle observation | Cycle 1 | Cycle 2 |
| --- | ---: | ---: |
| All audio contexts closed at first sample after Close | 173 ms | 152 ms |
| Last outbound socket frame after Close | 56 ms | 45 ms |
| Speech socket close event after Close | 1,378 ms | 1,361 ms |
| `recognition.retired` observed | Yes | Yes |

The later socket close is the asynchronous provider shutdown handshake, within
the adapter's existing five-second retirement guard. Four audio contexts and two
speech sockets were closed after the two focused cycles. The follow-up passed;
no application page errors or residual open context/socket were observed. These
are software lifecycle measurements, not physical microphone-indicator or speaker
stop measurements. The original one-second assertion failure remains documented.

## Repairs in this branch

- Optional synchronous `VoiceAdapter.prepare(signal)` lets the actual voice-open
  gesture unlock one output AudioContext before session creation, code loading,
  token acquisition and permission awaits. The lazy development adapter loads only
  a small preparation helper initially; the Azure SDK remains deferred.
- The connection adopts the prepared context exactly once. Closing/failing before
  adoption releases it; cancellation of the old preparation signal cannot close a
  newer or already adopted connection. Reconnect uses its own fresh gesture.
- Startup now verifies that output audio actually reaches `running`, with a bounded
  five-second wait. Rejected or perpetually pending `resume()` releases capture and
  reports an actionable reconnect state instead of silently proceeding. Initial
  AudioContext state is present in the existing privacy-safe local trace.
- If a production region repair changes the region in a renewal response, the old
  recognizer is retired instead of applying a credential from the new region to
  the old endpoint.
- The server token broker isolates cached and in-flight tokens by resource region
  and private credential fingerprint. Configuration normalization and safe provider
  failure responses support repair without exposing key material.
- UI preparation is optional. AgentPlace's native adapter remains authoritative;
  the transfer excludes the complete development Azure directory. This is not an
  Azure transplant into AgentPlace and does not replace free Luna.

The autoplay defect is reproduced at the browser-contract level: the old path
ignored a pending/rejected AudioContext resume and could report Listening with an
unusable output context. Physical Safari behavior is still a verification gate.
The SDK creates its own separate recording AudioContext after microphone capture;
output preparation alone is not a claim that every browser's capture restrictions
are solved. The customer's failing browser/device trace is unavailable, so the
reported production failure's exact original cause is not asserted.

## Automated evidence

29 Azure adapter tests and three audio preparation tests pass individually. The
five added adapter regressions cover prepared-context adoption, rejected resume,
resume timeout, close during pending resume with late completion, and changed
region during token renewal. The three helper tests cover synchronous gesture
activation, one-time adoption, close/reopen ownership and unsupported preparation.
Existing ten-turn SDK-parser simulations, interruption, exact pair persistence,
retry, stale callbacks and resource-retirement tests remain passing.

Frontend TypeScript passes. Separate real Chromium layout tests validate the UI
prepare/close/reconnect contract with an explicitly injected runtime fixture.
Neither these fixtures nor SDK simulations establish real audible playback.

## Reproduce the live software path

`scripts/live-voice-check.mjs` is opt-in and is deliberately excluded from automatic
CI. Supply a synthetic WAV with ten clear utterances and pauses long enough for
responses. This creates a new isolated consultation and invokes existing live
speech/model services; it may consume their existing allowances.

```sh
SYNTRA_LIVE_VOICE=1 \
SYNTRA_CHECK_URL=https://digital-S.replit.app \
SYNTRA_VOICE_WAV=/absolute/path/to/synthetic-ten-turns.wav \
SYNTRA_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
SYNTRA_CHROMIUM_PATH=/usr/bin/chromium \
node scripts/live-voice-check.mjs
```

The report contains only fixed stages, numeric latency, message counts, HTTP status
and error names. It does not save cookies, transcript text, audio or credentials.
Per-stage monotonic counters survive the app's bounded diagnostic mark compaction.
Close browser contexts after the run. Synthetic consultations remain in their
isolated test owners; no customer consultation is inspected or removed.

## Release boundary

Real human microphone permission, physical capture and audibility, speaker echo,
headset/speaker interruption and the original failing device still need live
verification. First PCM scheduling is not acoustic latency. The final release must
also verify current branch source in a credentialed preview, close/reopen and
recovery on supported devices, and free Luna/native realtime voice inside the
actual AgentPlace host before publication. No production deployment or final
AgentPlace assessment publication was performed by these checks.
