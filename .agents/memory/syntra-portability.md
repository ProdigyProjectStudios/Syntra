---
name: Syntra portability intent
description: Why the app is developed here but must preserve AgentPlace's native runtime boundaries.
---

The user is building Syntra in Replit and bringing the exact frontend into AgentPlace via the private Syntra GitHub repository. Preserve the interface rather than generating a replacement.

**Why:** The user explicitly wants AgentPlace's native GPT-6 Luna, bidirectional realtime voice and conversation/session handling, not a competing production service built here.

**How to apply:** Keep Replit usable for development; treat host-specific native SDK binding as a separate integration. Do not deploy to AgentPlace without a new instruction.

Future updates are bidirectional: Replit is the development environment and AgentPlace is the native production runtime. Keep the current frontend/domain authoritative and native bindings isolated; do not merge an older exported frontend over newer source.

**Why:** The user explicitly identified the AgentPlace frontend as an older adaptation and required safe future updates in both directions.

**How to apply:** Review incoming native changes as adapter/registration changes, regenerate the transfer from canonical source, and do not apply the historical baseline overlays to the app.
