---
name: Enquiry retry safety
description: Why an uncertain enquiry must retain its request identity and reviewed snapshot.
---
After an enquiry is attempted, retries must keep the original request ID and reviewed details, even after navigation or refresh. Do not unlock the fields or generate a fresh request ID merely because a transport call failed.

**Why:** A lost response can occur after the provider has already accepted the enquiry; a fresh ID could create a duplicate external action.

**How to apply:** Persist only the consented request in tab-scoped storage, isolate it by runtime/session, and require durable host-side idempotency. A future edit/cancel/new-attempt flow needs trusted server evidence of non-admission or terminal cancellation, not a browser timeout.
