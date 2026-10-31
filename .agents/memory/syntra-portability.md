---
name: Syntra portability intent
description: Why the app is developed here but must preserve AgentPlace's native runtime boundaries.
---

The user is building Syntra in Replit and bringing the exact frontend into AgentPlace via the private Syntra GitHub repository. Preserve the interface rather than generating a replacement.

**Why:** The user explicitly wants AgentPlace's native GPT-6 Luna, bidirectional realtime voice and conversation/session handling, not a competing production service built here.

**How to apply:** Keep Replit usable for development; treat host-specific native SDK binding as a separate integration. Do not deploy to AgentPlace without a new instruction.
