# Mobile opening: route splitting and deferred effects

## Production build comparison

Measured with the same Vite production build, existing dependencies and `BASE_PATH=/`.
Bytes below are actual file sizes, with Node's default gzip and Brotli compression.
The HTML initially references one JavaScript entry; no extra static vendor chunk was
introduced to move bytes outside this measurement.

| Initial JavaScript | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Uncompressed | 580,791 B | 537,956 B | 42,835 B (7.4%) |
| Gzip | 186,989 B | 174,366 B | 12,623 B (6.8%) |
| Brotli | 160,989 B | 151,043 B | 9,946 B (6.2%) |

Book (~22.68 kB raw), Brief (~10.80 kB raw), their shared handoff code
(~4.68 kB raw), and background/click visual effects (~8.31 kB raw) are now
separate chunks. Book, Brief and handoff code are requested only when needed.
Visual effects are requested after two animation frames and an idle callback
(1.2-second timeout), with a 200 ms timer fallback when idle callbacks are unavailable.
The initial CSS is essentially unchanged (~23.14 kB gzip).

This is a modest reduction, not elimination of the existing >500 kB Vite warning.
Transfer, parse and execution savings depend on the phone and connection; bundle
size alone does not establish a real-device speedup.

## Behavior and ownership

- Existing page remains mounted while an uncached route module loads.
- Once ready, the existing exit/enter animations run against frozen locations.
- Direct links render a small accessible loading state inside the unchanged shell.
- Stale loading completions cannot navigate back to an abandoned destination.
- Failed route imports display explicit recovery rather than hanging navigation.
- Only code modules/promises are shared. Native runtime providers, per-instance
  query clients, memory locations and Shell-owned voice remain unchanged.
- Canvas appearance, particle logic and interaction design are unchanged; only
  their initialization is deferred.

## Checks

- Production build and frontend TypeScript check passed.
- Consultation tests: 57 passed.
- AgentPlace transfer checks passed: checksums, exported syntax, scoped CSS,
  and 12 native export tests.
- Mobile preview screenshot (390 × 844) showed the existing hero, navigation,
  composer, orb and canvas styling, with no browser errors.

## Cold-open and first-navigation observations

A single browser pass at 390 × 844 compared locally served gzip-compressed
production builds with fresh browser contexts. The modified build showed the
hero and composer and did not request Book or Brief on Discover. Background
effects began at about 510 ms, after first contentful paint (FCP) at 188 ms.
The baseline FCP sample was 588 ms. These are single local diagnostic samples,
not a benchmark or a claim about real-phone speed.

With first-time route chunks delayed by about 800 ms, Discover remained
visible until both Brief and Book were ready. No inserted loading or blank
fallback was observed, and both pages settled correctly. Cold direct links
to `/brief` and `/book` also loaded. A rapid Brief-to-Discover action ended
on Discover, but the browser check did not conclusively establish that the
second click overlapped the held chunk response; that exact race remains
unverified in a browser. The cancellation guard was checked in code.

An intentional 503 chunk failure revealed that an in-document import retry
could remain cached as failed. The final recovery UI therefore offers
**Reload app**, not an ineffective re-import. This small follow-up was
confirmed with the production build and type/transfer checks, rather than
another full browser run. Cold timing samples above precede this error-only
copy/button adjustment (the measured entry was 20 gzip bytes larger).
Normal-flow console and page errors were empty.

Baseline and changed build snapshots and browser diagnostics are local generated
outputs under `generated-artifacts/mobile-performance/`, excluded from Git and
deployment. No libraries were replaced, no AI backend code was changed, and
nothing was deployed.
