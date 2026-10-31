---
name: Route transition flash
description: Why page containers must render with a frozen location during AnimatePresence route transitions.
---
The Shell's page transition (AnimatePresence mode="wait", keyed by location) must render routes with the location it was created for (`Switch location={...}` via a render-prop child), never the live location.

**Why:** wouter's Switch reads the live URL, so the exiting container showed the incoming page, faded it out, then the new container animated it in again. The user saw this as content flashing between tabs.

**How to apply:** any new animated route wrapper or nested route switch inside a transition must take the location as a prop rather than reading it from context.

Deferred route code must finish loading before the outgoing page begins its exit animation. Keep the last ready location displayed while the requested location loads, and ignore stale completions after another navigation.

**Why:** `AnimatePresence mode="wait"` does not mount the incoming page until the outgoing animation ends. A Suspense boundary inside that incoming page can therefore produce a blank gap even when navigation is wrapped in a React transition.

**How to apply:** resolve route-only modules before changing the animated container's key. Only cache module code globally; runtime, conversation, voice and navigation state must remain scoped to each app instance.

Do not promise that retrying a failed dynamic import in the same document will recover.

**Why:** the browser verification showed a deliberately failed module request remaining failed after a same-URL import retry; browsers may cache that failure in their module map.

**How to apply:** provide honest reload-based recovery for chunk failures unless a separately verified host-specific recovery mechanism exists.
