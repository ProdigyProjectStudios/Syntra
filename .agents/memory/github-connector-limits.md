---
name: GitHub connector request limits
description: Why GitHub object transfers need conservative proxy request pacing.
---

Pace GitHub connector calls conservatively rather than relying only on GitHub's
reported remaining API quota.

**Why:** A repository transfer encountered a separate connector-proxy limit of
10 requests per second. Parallel tree/history requests exceeded that limit even
though GitHub itself still had quota.

**How to apply:** Use bounded sequential requests with retry/backoff for bulk
object transfers, and distinguish proxy throttling from missing repository
access. Do not ask for credentials to solve a rate-limit response.
