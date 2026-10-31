---
name: Route transition flash
description: Why page containers must render with a frozen location during AnimatePresence route transitions.
---
The Shell's page transition (AnimatePresence mode="wait", keyed by location) must render routes with the location it was created for (`Switch location={...}` via a render-prop child), never the live location.

**Why:** wouter's Switch reads the live URL, so the exiting container showed the incoming page, faded it out, then the new container animated it in again. The user saw this as content flashing between tabs.

**How to apply:** any new animated route wrapper or nested route switch inside a transition must take the location as a prop rather than reading it from context.
