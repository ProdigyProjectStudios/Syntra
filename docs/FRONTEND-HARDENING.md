# Frontend hardening — 1 November 2026

## Changes

The Digital Prodigy palette, typography, constellation network, click effects,
neural core and specialist visuals are retained.

- Standalone layout follows the browser's visual viewport during keyboard resize
  and scroll. Updates write frame-batched CSS properties rather than rerendering
  the conversation. Pinch zoom is not intercepted, and native AgentPlace retains
  ownership of its stage geometry.
- Safe-area padding protects header, composer, specialist rail and voice controls.
  The viewport declaration includes `viewport-fit=cover` and the supported
  `interactive-widget=resizes-content` hint.
- Voice measures its caption/recovery area before allocating orb space. Long
  responses remain scrollable without covering controls at the tested widths.
- Mobile navigation and compact response-depth controls now retain accessible
  names. Current-route state, roving radio focus, arrow/Home/End depth selection,
  contained scrolling and larger mobile navigation targets are implemented.
- Sessions uses dialog semantics, focus containment, Escape and focus restoration.
  The consultation becomes inert while a modal owns interaction. Voice entry
  dismisses the keyboard and returns focus to its opener on exit.
- Covered consultation canvases pause while voice or sessions is open. The active
  voice orb continues to render. An unused Inter stylesheet request is removed;
  the existing Inter Tight, Unbounded and JetBrains Mono font sources remain.
- Voice entry and Reconnect call the optional audio preparation hook directly
  inside their user gesture, before asynchronous session or SDK work. Unadopted
  preparation is released on close, failure and unmount. Native adapters without
  the optional hook retain their own audio behavior.

## Reproducible browser check

Build and serve the frontend, then run:

```sh
SYNTRA_CHECK_URL=http://127.0.0.1:5173 node scripts/frontend-layout-check.mjs
```

The runner uses Playwright. `SYNTRA_PLAYWRIGHT_MODULE` can point to an existing
Playwright ESM entry, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an
existing Chromium binary. Screenshots and numeric results are written to
`generated-artifacts/frontend-hardening` (ignored by Git).

The fixture is explicitly installed through the existing runtime boundary only
in the isolated browser page. It does not add a production fake service. No
customer conversation, provider credential, enquiry or booking is used.

The first Chromium pass verified 320×568, 375×812, 390×844, 768×1024 and 1440×900:
no horizontal overflow or page errors; the composer remained visible; navigation
names/current state and response-depth keyboard selection worked; sessions and
voice owned focus; long voice captions remained above controls; closing voice
restored the opener. For example, at 320px the caption ended at 423.95px and the
controls began at 468px. Shrinking the viewport to emulate keyboard geometry
kept the mobile composer visible. This is browser geometry evidence, not a
physical iOS/Android keyboard test.

The assertion runner passed the same five widths against the integrated build,
including modal Tab containment, audio-preparation activation/cleanup,
failed-connect/reconnect cleanup, and zero `drawImage` calls from covered canvases
in each 300ms observation. The active voice visuals remained rendered. This
measures the covered-canvas optimization, not a production FPS benchmark.

The pause check identifies the consultation and ambient canvases explicitly and
requires both to be present. Click feedback occupies a separate foreground canvas
above the voice modal; its animation is intentionally preserved. The check now
triggers that feedback during the observation and requires foreground drawing
while covered drawing remains zero. This avoids mistaking a still-visible click
burst for hidden rendering on slower CI machines.

## Performance evidence boundary

The exact starting commit `fd406a1f218fa5ed9d53a83831e487ec7ae0bd90` was exported
into an isolated directory and built with the frozen dependency tree and
`VITE_SYNTRA_VOICE_PROVIDER=azure`. Its initial entry was 596,738 bytes raw,
193,697 bytes gzip and 166,473 bytes Brotli, matching the inspected production
entry. With the same `VITE_SYNTRA_VOICE_PROVIDER=azure`, `PORT=5173` and
`BASE_PATH=/` settings, the integrated release build separates the Azure
transport from text-first startup. Its initial entry is `index-hdy8MTIl.js`:

| Initial JavaScript | Verified baseline | Integrated candidate | Reduction |
| --- | ---: | ---: | ---: |
| Raw | 596,738 B | 567,889 B | 28,849 B (4.83%) |
| Gzip | 193,697 B | 184,716 B | 8,981 B (4.64%) |
| Brotli | 166,473 B | 158,826 B | 7,647 B (4.59%) |

These savings include the new recovery and accessibility code. Compression uses
Node's default gzip and Brotli settings. The candidate was built locally; this
comparison does not claim that the public production deployment was updated.

Bundle reduction and skipped covered canvas drawing are measured implementation
changes. They do not establish a real-phone frame-rate or production latency
improvement. Actual speech recognition, synthesis, physical interruption and
native Luna require their separate live acceptance checks.
