# Voice reliability — Pro run 2

Base: `2bfb6a6aac37e7fb167a08ca5a33af2ebaeb8f03` on `feature/syntra-assessment-voice`. Date: 31 October 2026. No publication or main-branch merge is part of this run.

## Reproduced defects and fixes

| Reproduced problem | Implemented correction |
| --- | --- |
| A rejected later fragment could cancel endpointing and strand already-accepted words. | Settle only its matching recognition and resume the accepted queue without truncation. |
| Physical speech-end, stale final or repeated NoMatch could unlock/relabel unresolved input. | Preserve pending recognition until a matching terminal result; remember terminal IDs and reject stale callbacks. |
| A provisional interruption followed by NoMatch could save a model reply but leave no speech or recovery action. | Offer explicit replay of the saved reply; never resend the model or restart obsolete speech automatically. |
| Closing during an unresolved permission prompt could retain a connection promise or adopt late capture. | Abort promptly, stop late grants, prevent a second unresolved prompt and enforce one adapter connection. |
| Buffered results could arrive after mute; new recognition could overlap asynchronous old SDK shutdown. | Retire callback epochs, use owned stream clones, and await the real close callback before replacement. |
| Local noise without an SDK result could leave the conversation permanently input-locked. | Use bounded adaptive onset detection and a five-second local-only recovery path that retires the old recognizer before unlocking. |
| Muting during that recovery could resurrect a recognizer from an old asynchronous start. | Compare the requested generation after shutdown waits; stale/muted starts never allocate a new recognizer. |
| Revoked capture or suspended output could leave unusable controls and misleading playback state. | Close on microphone loss; offer saved-response replay on suspended output; detach terminal UI handles and filter late events. |
| A very large first PCM chunk bypassed the existing queue-horizon check. | Validate the complete incoming duration before allocating buffers/nodes; independently release all nodes if one cleanup fails. |
| A lost consultation response could leave voice thinking indefinitely. | After 120 seconds expose uncertainty with the original ID and words; late output cannot play, and recovery reuses that intent. |
| Concurrent API requests could both pass the busy check before their receipt lookups completed. | Acquire the tested process admission gate synchronously before the first await and release it on all outcomes. |
| Global/latest-only latency timestamps could mix queued replies, retries and receipt retrieval. | Correlate original turn phases and retain bounded numeric samples, separating recovery from original model round trips. |

All three engineers reviewed the same controller, adapter, UI and admission changes. The neural renderer, palette, typography, orbital signatures and specialist metadata remain unchanged. UI edits concern transcript position, focus, notices and recovery controls; no rendered visual equivalence is claimed without a browser pass.

## Automated evidence

| Suite | Passing tests |
| --- | ---: |
| Consultation engine | 30 |
| Native runtime/repository | 30 |
| Handoff | 14 |
| Voice controller | 28 |
| Azure adapter lifecycle | 16 |
| PCM playback | 8 |
| UI connection lifecycle | 5 |
| Local onset detector | 2 |
| Latency diagnostics | 3 |
| API admission | 3 |
| Speech token broker | 7 |
| **Total** | **146** |

Full workspace TypeScript and production builds pass. Deterministic AgentPlace validation passes 129 checksums, 125 TS/TSX syntax files, scoped stylesheet compilation and exported tests. The compiled stylesheet remains 179,500 bytes; that does not replace pixel/device inspection. The Azure adapter and development helpers remain excluded from the native transfer.

Adapter tests execute production code against fake SDK, MediaStream, AudioContext, timers and network responses. They prove event ordering and owned-resource handling. They do **not** establish that a real microphone recorded speech, that a speaker emitted audio, that Azure accepted a credential, or that a measured duration represents cloud/hardware latency.

## Live evidence and blockers

- No Azure Speech key/region or development model/database credentials were present in the engineering runtime.
- The connected-browser tool reported no originating browser context. The available cloud Replit tab showed a signed-out public page, not the Syntra project.
- No real microphone capture, spoken playback, speaker echo test, native Luna execution or new rendered Syntra device check occurred.
- No empirical p50/p95, voice-quality ranking or claim of improved real-world latency is made. Performance timings produced by fake-clock tests are not provider benchmarks.

## Latency investigation

Recognition exposes Azure's own numeric recognition-latency result property. Model timings now follow each original turn, and receipt recovery has a separate metric. Synthesis records available first-byte, completion, connection, network and service properties. PCM scheduling and synchronous stop work are measured separately from physical audio output.

The configured 500 ms segmentation silence and 350 ms coalescing are visible sources of waiting, while full model completion and a fresh synthesis connection can also contribute. They have not been ranked by real measurements. This run preserves those thresholds and the complete structured reply contract rather than claiming an unmeasured latency win. Existing streaming PCM begins without downloading an entire response.

To inspect recent real samples, run this in the authenticated preview's browser console after completing actual speech turns:

```js
const grouped = new Map();
for (const entry of performance.getEntriesByType('measure')) {
  if (!entry.name.startsWith('syntra.voice.')) continue;
  const values = grouped.get(entry.name) || [];
  values.push(entry.duration);
  grouped.set(entry.name, values);
}
console.table([...grouped].map(([metric, values]) => {
  values.sort((a, b) => a - b);
  const percentile = p => Math.round(values[Math.ceil(values.length * p) - 1]);
  return { metric, samples: values.length, medianMs: percentile(0.5), p95Ms: percentile(0.95) };
}));
```

Do not mix original-turn latency with `turn-recovery`, permission delays or explicit playback retries. Stop-duration samples measure software execution; collect an audible recording or hardware observation before making a speaker-stop claim. No transcript or token is needed for the numeric report.

## Recommended Pro run 3

Use a credentialed Replit preview and a browser with real microphone/speaker access. Configure the existing adapter via Secrets using [the setup guide](VOICE-INTELLIGENCE.md), then complete:

1. Ten continuous turns across all three specialists, preserving depth, manual brief edits and saved conversation history.
2. Headset and laptop-speaker interruption tests, including quiet speech, steady room noise, repeated words and interruption near response completion.
3. Permission allow/deny/revoke, close during permission, ten reopen cycles, mute/unmute during response and recovery, and an active session beyond token renewal.
4. A latency report with sample counts, median/p95 and distinct recognition/model/synthesis/scheduling stages; tune only the demonstrated bottleneck.
5. Native transfer/type integration and free Luna/voice checks once the actual AgentPlace workspace is accessible. Verify full native model-lifetime serialization before its first voice tool call.

Public release remains a later verified step. Additional industry intelligence or model-token-to-speech streaming should not displace these credentialed checks.
