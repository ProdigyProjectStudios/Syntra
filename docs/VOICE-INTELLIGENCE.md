# Syntra Voice Intelligence

Implementation and evidence as of 31 October 2026. This guide distinguishes portable implementation from live provider and native-host verification.

Pro run 2 reliability changes and verification boundaries are recorded in [Voice reliability — run 2](VOICE-RELIABILITY-RUN-2.md).

## Architecture

`VoiceAdapter` remains the replaceable runtime boundary. AgentPlace keeps its own model, native realtime voice, session lifecycle and transcript owner. Replit can opt into an Azure development adapter without changing that host integration.

The development path is microphone capture → continuous speech recognition → finalized-turn controller → existing consultation runtime → streamed speech synthesis → owned Web Audio playback. Interim recognition updates captions only. Final fragments are coalesced into one request, and duplicate recognition result IDs are suppressed. Only one admitted model request runs at a time. The resulting messages and project brief use the same persistence path as text consultation.

Speech synthesis emits raw 24 kHz, 16-bit mono PCM chunks. The player owns the scheduled audio nodes and stops them immediately on interruption. Epoch checks discard late synthesis/model playback callbacks. An already-admitted model request is allowed to settle and persist; interrupting speech does not erase it or send the same intent again.

Azure's meaningful recognition events drive turn-taking; a sustained local input-energy rise also cancels audible output without a network round trip. During output, a bare provider speech-start event alone does not cancel playback. The local detector learns a bounded noise floor only outside playback/recognized input. Meaningful partial/final recognition can still interrupt a quiet speaker below the energy threshold. No text-similarity filter discards genuine repeated words.

Echo cancellation, noise suppression and automatic gain control are requested from the browser. The energy detector is a heuristic that needs real speaker/headset testing; it is not semantic VAD or measured echo rejection. The neural animation still reads actual microphone/output analyser RMS, with unchanged visual design.

If a local-only interruption becomes quiet and the provider supplies no recognition events for five seconds, the adapter retires that recognizer's epoch before releasing the pending input. It then starts fresh recognition and asks the visitor to repeat the uncaptured interruption. Renewed local energy resets the grace period; provider activity cancels this fallback. It never timeout-unlocks an identified provider interim or admits a late old-epoch final under a different specialist.

The model currently returns a complete structured consultation reply before synthesis starts. Audio is streamed, but LLM tokens are not yet streamed directly into speech. Improve this only after live measurements identify the dominant latency and after preserving atomic brief updates and safe turn replay.

## Provider decision

| Candidate | Evidence and integration implications | Decision |
| --- | --- | --- |
| Azure Speech SDK | Official JavaScript APIs expose continuous recognition, partial/final results, speech-start events, custom microphone streams and synthesis audio events. British female neural voices are documented. One provider can cover input and output while the existing model remains authoritative. | First optional development adapter, pending real latency/quality tests. |
| Kokoro.js | The official implementation supports local browser inference through WASM/WebGPU and streamed text-to-audio generation. It is a TTS component: separate recognition, VAD, turn orchestration, model download/startup and device performance work remain necessary. | Keep as an alternate output adapter candidate; do not claim a complete realtime conversation from TTS alone. |
| Azure Voice Live | A separate managed realtime product, with its own model and pricing choices. It is not the Speech F0 allowance. | Not adopted here; it would complicate the existing model/runtime and native-host boundary before evidence establishes a benefit. |

Microsoft's published Speech F0 allowance currently lists five hours of realtime speech transcription and 0.5 million neural synthesis characters per month. Standard/custom transcription share the allowance. Resource limits and available regions still apply; this is not unlimited free production traffic. No Azure resource, paid subscription or extra model connection was created by this change. Verify the selected account/resource tier before enabling it.

No comparable live provider benchmark has been run in this workspace. There are no measured latency or voice-quality scores to report. The SDK's browser compatibility and account-specific voice availability must be verified on the intended Replit preview.

Primary sources, checked for this implementation:

- [Azure Speech pricing and F0 allowance](https://azure.microsoft.com/en-us/pricing/details/speech/)
- [Azure Speech voice/language catalogue](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)
- [JavaScript SpeechRecognizer API](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest)
- [JavaScript SpeechSynthesizer API](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechsynthesizer?view=azure-node-latest)
- [JavaScript AudioConfig API](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/audioconfig?view=azure-node-latest)
- [Kokoro.js official implementation](https://github.com/hexgrad/kokoro/blob/main/kokoro.js/README.md)

## Enable in the existing Replit development workspace

The existing consultation API, model and database must already work. Speech does not replace them.

1. Pull the reviewed feature branch and install with `pnpm install --frozen-lockfile` using pnpm 10.16.1.
2. In the server environment, set `SYNTRA_VOICE_PROVIDER=azure`, `AZURE_SPEECH_REGION` to the actual resource region, and `AZURE_SPEECH_KEY` through Replit Secrets. Do not commit the key, put it in a `VITE_` variable or paste it into chat.
3. Set the public, nonsecret frontend flag `VITE_SYNTRA_VOICE_PROVIDER=azure` and restart/rebuild the frontend. Both frontend and server configuration are required. Without the flag, voice remains an explicitly disconnected identity preview.
4. Run the existing frontend/API workflows, open the HTTPS Replit preview, create or resume a consultation, and enter voice mode. Grant microphone access when prompted.
5. Complete the acceptance matrix below before describing the voice experience as verified or enabling it for public traffic.

`GET /api/voice/config` exposes only safe enabled/provider/region metadata. `POST /api/voice/token` requires the development session, a JSON request with `X-Syntra-Voice: 1`, and ownership of the requested consultation. The server exchanges its long-lived key for a short-lived provider token. It uses a fixed regional endpoint, a request timeout, token caching and shared refresh requests. The recognizer receives renewed tokens explicitly.

The token broker has conservative per-owner and process request limits. These are development process guards, not durable cross-worker abuse protection or Azure billing caps. Short-lived provider tokens are still credentials and must not be logged or copied into diagnostics.

The adapter dynamically loads the SDK on voice entry. Closing the dialog stops microphone tracks, cancels owned playback, closes provider resources and removes timers/listeners. Quiet sessions close after approximately three minutes; an active response is not cut off by that timer.

Only one connection belongs to an adapter at a time. Closing during a microphone permission prompt rejects promptly; any late grant is stopped rather than adopted. Another unresolved prompt is not opened. The SDK receives an owned clone of the retained microphone stream. Mute retires its callbacks and clone; unmute starts fresh recognition in the same consultation. A new SDK recognizer waits for the previous close callback, with a five-second bounded wait. A failed or stalled shutdown does not authorize a second provider stream. Microphone loss closes the session; suspended playback exposes replay of the saved reply.

## Three specialists, one customer context

| Stored role ID | Working identity | Responsibility | Development voice |
| --- | --- | --- | --- |
| `syntra` | Syntra | Principal consultation, qualification and next steps | `en-GB-SoniaNeural` |
| `technical` | Caelis | Architecture, integrations, dependencies and phased implementation | `en-GB-LibbyNeural` |
| `automation` | Veyra | Operational workflows, useful automation pilots and explicit savings assumptions | `en-GB-BellaNeural` |

Caelis and Veyra are provisional names. Rename display metadata without changing persisted role IDs. The selected profile contributes guidance to the same underlying model call. There are no three parallel model connections and no separate customer memories. Existing message history, eight-field brief, provenance, manual edits and response depth remain shared.

The role and depth are captured for the first finalized utterance fragment before model admission. Switching is blocked while an utterance, queued request, in-flight model call or uncertain result is unresolved. Switching during playback stops that audio before changing profile. An uncertain request restored after reconnect keeps its original request ID and specialist; the UI adopts the restored identity. Historical inputs without a role default to Syntra.

The compact rail appears only in voice mode, with focus/hover descriptions, keyboard navigation, reduced-motion support and a mobile dock. It preserves the existing neural visual system. Distinct motion/color profiles are UI work, not proof that a provider connection is operating.

Native hosts advertise supported profiles through the optional voice capabilities. Until AgentPlace supplies real specialist/personality and voice switching, the native UI supports Syntra only. Portable metadata is not a substitute for that host implementation.

Native repository guards prevent new typed reservations while voice work is staged and prevent new voice staging while another typed/voice turn is pending. Completed receipts remain replayable. Trusted success or terminal-failure hooks release pending state; browser disconnects and timeouts do not. Voice staging begins inside the native tool, after native model admission, so these guards do not serialize the entire provider turn. AgentPlace must enforce that earlier admission boundary and verify it in the real host.

## Recovery contract

- Interim captions never become standalone model requests. Stable result IDs deduplicate recognition callbacks; saying the same words in a later genuine turn remains valid.
- Before a new model send, the original input is saved in tab-scoped session storage. Storage failure prevents an unsafe send. An uncertain outcome exposes an explicit retry of the original request, not a new request ID.
- Playback failure exposes **Replay response** and uses the already-saved reply; it never reruns the model. The replay interaction can also unlock browser audio when autoplay restrictions suspended it.
- A barge-in stops audio immediately. A late model response can update the canonical conversation and brief while its obsolete speech remains suppressed.
- Correlated NoMatch results clear only an unaccepted interim. If no replacement turn was captured, a saved interrupted reply can be replayed explicitly. A physical speech-end event alone does not resolve a pending transcript or unlock specialist selection.
- A model/HTTP response that remains unconfirmed for 120 seconds becomes an uncertain original request. The underlying model is not claimed canceled; late output is suppressed until the same request is explicitly recovered. The UI shows which original words will be retried, separately from newer held speech.
- Muting disables capture tracks. Closing the connection stops them. A provider/permission failure leaves the saved text consultation available.

## Automated and live verification

The current automated total is 146: consultation 30, native 30, handoff 14, voice controller 28, Azure adapter 16, PCM player 8, UI connection lifecycle 5, local onset gate 2, diagnostics 3, development API admission 3 and token broker 7. Browser/provider objects in adapter tests are deterministic fakes. These checks verify ownership and event ordering, not actual capture, audible output, echo rejection, cloud latency or voice quality. The full TypeScript/build and deterministic transfer also pass; the transfer validates 129 checksums and 125 TS/TSX files.

| Live scenario | Acceptance evidence to collect | Current status |
| --- | --- | --- |
| Permission and lifecycle | Allow/deny microphone; close while permission or connection is pending; confirm capture indicator stops; reopen without duplicate streams. | Pending |
| Continuous conversation | At least ten alternating turns, short pauses and multi-fragment speech; exactly one saved visitor/advisor pair per admitted turn; final brief matches text view. | Pending |
| Barge-in and echo | Headset and laptop speaker tests; interrupt early/mid/late reply; old audio stops, no late restart, no self-triggered reply loop; record observed stop delay. | Pending |
| Three specialists | Listen to all three voices; confirm specialist behavior, preserved history/manual brief edits and role-correct recovery; pending turns prevent switching. | Pending |
| Recovery | Lost model acknowledgement, blocked audio, silence, offline/reconnect, microphone revoke and tab close; original intent is not duplicated. | Pending |
| Token lifetime | Keep an active conversation beyond ten minutes; verify recognition/output after renewal without exposing tokens. | Pending |
| Visual and device pass | Replit desktop/tablet/mobile, small viewport, keyboard focus, reduced motion, captions and rail overlap; actual input/output amplitude responds to sound. | Pending |
| Native AgentPlace | Host SDK/type integration, free Luna, real native microphone/playback, exact response-identity transcript pairing, safe retries, real enquiry link and public signed-out URL. | Pending |

Local Performance API measurements retain at most 64 numeric samples per metric. Controller sequence numbers correlate each original turn internally and never appear as customer/request identifiers in measurements. No transcript, audio or account data is recorded or sent to telemetry. Inspect results after real speech in browser developer tools:

```js
performance.getEntriesByType('measure')
  .filter(entry => entry.name.startsWith('syntra.voice.'))
  .map(({ name, duration }) => ({ name, milliseconds: Math.round(duration) }));
```

| Metric suffix | What it measures |
| --- | --- |
| `recognition-sdk` | SDK-reported time from its last contributing audio fragment to receipt of the recognition result. |
| `final-to-admission` | First accepted final fragment to model admission, including coalescing and waiting for an earlier request. |
| `model-response` | Original consultation API round trip, including model execution and transport. |
| `turn-recovery` | Retried request round trip, which may retrieve a receipt; kept separate from original model timings. |
| `synthesis-first-byte`, `synthesis-finish`, `synthesis-connection`, `synthesis-network`, `synthesis-service` | Optional numeric properties from actual Azure synthesis results. |
| `synthesis-to-audio` | Synthesis attempt start to scheduling the first playable PCM chunk; includes explicit playback attempts. |
| `reply-to-audio`, `final-transcript-to-audio` | Correlated original reply/final-fragment timing to first PCM scheduling; explicit replays and recovered requests are excluded. |
| `interruption-stop` | Synchronous software cancellation work, not physical speaker stop latency. |
| `connection-ready` | SDK/token/microphone/startup time, including time waiting for permission. |

Capture multiple real turns to report median and p95. Scheduling a Web Audio source is not measurement of sound at a speaker. The configured 500 ms provider segmentation silence and 350 ms final-fragment coalescing remain unchanged pending empirical tuning; they are configured waits, not observed end-to-end latency. This implementation still awaits the complete structured model reply before speech. See Microsoft's [latency guidance](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-lower-speech-synthesis-latency) and the installed 1.53.0 SDK's `PropertyId` definitions for provider metric meanings.

The development API now acquires its process-local admission guard before the first asynchronous receipt lookup. This prevents two same-session requests from entering the model together in one server process. Database transactions protect committed message pairs/receipts; they do not serialize model calls across workers. Distributed admission remains a deployment concern, and AgentPlace retains its own trusted native admission/lifecycle requirements.

## Transfer and release

Run `pnpm test`, `pnpm test:voice`, `PORT=5173 BASE_PATH=/ pnpm build` and `pnpm test:agentplace`. Regenerate the transfer manifest from the same reviewed source. The exporter excludes the development Azure directory and Replit runtime composition; preserve AgentPlace's existing SDK and dependencies.

Follow the host registration guide, complete the native matrix, then verify the public AgentPlace URL while signed out. The approved external conversion destination is [Digital Prodigy's contact form](https://digitalprodigy.dev/contact). No calendar appointment, enquiry delivery or public deployment is established by a successful local test or export.
