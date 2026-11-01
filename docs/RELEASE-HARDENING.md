# Syntra release hardening — 1 November 2026

Branch: `release/syntra-production-hardening`, based directly on verified
`feature/syntra-assessment-voice` commit `fd406a1f218fa5ed9d53a83831e487ec7ae0bd90`.
The release candidate is reviewable; final production and AgentPlace publication
remain gated on the device/native-host checks below.

## Production diagnosis and evidence

The exact baseline frontend asset matches production (`index-BOuJ-vno.js`,
596,738 bytes). Both voice enable flags are present. The deployed token broker,
Azure `uksouth` voice catalogue, recognition and synthesis worked in live probes.
The blanket production outage was not reproduced in the available Chromium
environment; the original failing device/browser is unavailable.

The owner subsequently identified Android Chrome. A focused review found two
concrete recovery gaps: post-startup audio suspension while listening/thinking and
sustained OS microphone-source muting could leave an apparently live session.
Both now surface explicit recovery, with a 1.5-second grace for source interruptions,
intentional app mute preserved, and original pending requests retained. Nine added
regressions cover these paths. This does not establish the cause on the actual phone.

A controlled prerecorded-WAV run used Chromium's native capture device and the
unmodified production SDK, model and persistence. It produced ten model replies
and ten real synthesized PCM starts, nine software interruptions, and one token
refresh in one continuous recognition session. Its checkpoint contained 21 unique
messages: ten pairs plus the greeting. The WAV loop started an eleventh request
during shutdown, whose final persistence was not inspected. This is live cloud
software-path evidence, **not ten human spoken exchanges or audible verification**.

Median model round trip was 3,379 ms and final transcript to first scheduled PCM
was 4,972 ms, both n=10. The model stage dominates the measured wait. No reduction
in provider latency is claimed. The full evidence and limitations are in
[Production voice recovery](VOICE-PRODUCTION-RECOVERY.md).

The changed frontend was also tested by substituting its built HTML/assets in one
isolated browser while retaining the production origin/API/providers. Two Concise
turns fully played, five unique messages persisted, and closing/reopening worked.
A focused follow-up measured audio contexts closed by the first 173/152 ms samples
and SDK sockets closed after 1,378/1,361 ms. The first harness incorrectly required
socket closure within one second; the follow-up established normal asynchronous
retirement within the existing five-second guard. This was a browser source
overlay, not a deployment, and still used synthetic capture.

After the phone-interruption changes, an Android-user-agent/mobile-touch run of
the updated candidate completed two full live-provider playbacks, reopened, and
retained the same five unique messages and Concise depth after reload. All four
audio contexts and speech sockets closed without browser errors. This used desktop
Chromium mobile emulation and synthetic input; physical Android remains a gate.

No Azure resource, region, SKU, network rule or key was changed. Existing speech
and model allowances were used for bounded synthetic checks; exact charges cannot
be determined without billing access. No service or paid tier was introduced.

## Five engineering responsibilities and integration

| Responsibility | Implemented and cross-reviewed |
| --- | --- |
| Voice runtime | Synchronous gesture preparation, single-owner audio adoption/cleanup, bounded and verified AudioContext activation, safe changed-region renewal, capture/continuous-turn investigation and opt-in live probe. |
| Conversation architecture | PostgreSQL transaction advisory admission across healthy autoscaled workers, pinned connection/savepoints, bounded database queries, durable typed retries, pending-text/voice exclusion, canonical native audio transcripts, immutable voice depth/identity and scoped late-result handling. |
| Frontend/performance | Keyboard viewport and safe areas, accessible navigation/depth controls, modal focus/inert handling, responsive captions, covered-canvas suspension, deferred Azure implementation and retained cinematic effects. |
| Assessment/business | Verified portfolio guidance shared across runtimes, consent bound to reviewed brief revision, immutable eight-field enquiry snapshots and retry identities, receipt protection, clipboard fallback and approved external contact route. |
| QA/delivery | Reproducible browser layout/workflow suites, real PostgreSQL integration checks, pinned package manager, release/PR CI coverage and separate evidence for fixtures, live providers and physical/native acceptance. |

The lead integrated shared changes. Cross-review covered voice preparation and
runtime ownership, native response identity, transcript/depth persistence,
database transaction completion, handoff consent/snapshots, and browser evidence.
Azure remains excluded from the generated AgentPlace transfer. Syntra, Caelis and
Veyra retain shared conversation, depth and brief context; distinct native profiles
are exposed only if the actual host supplies them.

## Completed validation

| Check | Result |
| --- | --- |
| Frozen dependency install | pnpm 10.16.1; lockfile unchanged; no new shipped dependency |
| Consultation/native/handoff/controller tests | 115 passed |
| Voice/audio/token/API/retry tests | 94 passed |
| Real isolated PostgreSQL 16 integration | 5 passed: concurrency/manual edits/replay, rollback, pool saturation, ownership and query deadline |
| Workspace TypeScript and production builds | Passed |
| AgentPlace transfer | 132 checksums, 128 TS/TSX syntax files, scoped CSS and 12 exported native tests passed |
| Chromium layout | 320×568, 375×812, 390×844, 768×1024 and 1440×900; no overflow or page errors |
| Chromium workflows with synthetic runtime | Lost acknowledgement/reload/original-ID recovery, brief provenance/export, consent/retry and isolated browser sessions passed |
| Live deployed provider checks | Azure token/catalogue/synthesis and repeated cloud turns observed; see voice report |
| Candidate frontend with live providers | Two full playbacks, Concise depth, five unique messages, close/reopen and bounded asynchronous socket cleanup observed in browser asset overlay |
| Android-style touch with live providers | Updated candidate: two full playbacks, reopen, identical persisted history after reload, all contexts/sockets closed; desktop Chromium emulation and synthetic microphone |
| Existing live HTTP suite against deployed baseline | Nine scenarios passed (10 TAP entries with parent): private session/ownership/CSRF, manual edit/clear conflicts, real model qualification, atomic persistence, depth, replay and concurrent manual correction |

Browser workflow fixtures exercise actual rendered UI but do not certify provider
delivery or production storage. The local PostgreSQL tests use a random disposable
schema and no live customer database. Native transfer validation checks portable
source and exported tests, not the unavailable AgentPlace SDK or Luna execution.
Existing non-failing bundle-size, third-party sourcemap and generated module-type
warnings remain visible in build output.

The live HTTP harness was made origin-selectable and opt-in, and corrected to
retain multiple Set-Cookie headers: production also sets a routing cookie, which
the older single-cookie test client incorrectly substituted for its session cookie.
That initial harness failure did not establish a production ownership defect.

Initial JavaScript decreased from 596,738 to 567,889 bytes raw, 193,697 to 184,717
gzip, and 166,473 to 158,790 Brotli (4.83%, 4.64%, 4.62%). These are same-config
local production builds, not deployed network speedups. Covered canvases produced
zero draw calls in each sampled 300 ms browser interval; visible cinematic effects
remain intact. See [Frontend measurements](FRONTEND-HARDENING.md) and
[Reproduction/CI guidance](RELEASE-VALIDATION.md).

## Remaining release gates

1. Deploy the reviewed source into the existing credentialed Replit preview and
   verify the reported failing Android Chrome phone. This workspace has public access
   and owned test sessions but no Replit deployment identity, backend runtime logs,
   Azure management identity or production database credentials.
2. Complete ten human spoken exchanges with verified audible output; early/mid/late
   interruption on speakers and headset; echo behavior; permission allow/deny/revoke;
   physical mobile keyboard; microphone release/reopen and persisted reload checks.
   Software PCM stop is not acoustic interruption latency.
3. Integrate and typecheck the reproducible transfer against the real AgentPlace
   SDK. Confirm free Luna, trusted native session/admission lifecycle, real native
   voice, shared history/depth/brief, and a signed-out public URL before publication.
4. Keep the approved external route <https://digitalprodigy.dev/contact>. Opening it
   neither sends the brief nor books an appointment. No enquiry was submitted in
   this run; any native provider action needs its real consent and receipt checks.

PostgreSQL admission holds a transaction/connection during model work; production
pool capacity and idle transaction timeouts need configuration review. A lost
database connection releases its advisory lock while an external model call may
still run. This is not a durable model-call reservation across crashes, although
committed receipts/pairs and original client retry identities remain protected.

No merge into `main`, production source deployment or final AgentPlace assessment
publication is authorized by the passing automated checks alone.
