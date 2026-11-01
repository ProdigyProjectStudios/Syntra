# Syntra Decision Lab

The Decision Lab at `/lab` turns a visitor's own operational or product challenge into a decision canvas. It is usable across markets without requiring a consulting enquiry. Visitors can try four sample scenarios, enter their own constraints, compare three credible paths, inspect assumptions and uncertainty, export Markdown, or bring the recommended path into the existing advisor.

## What is implemented

- Stateless `POST /api/opportunity/analyze` with bounded input and output validation. No Decision Lab input or result is written to the application database.
- Model output compares a process/existing-tool route, a bounded AI-assisted route and a deeper custom system route. The recommendation includes a first experiment and success signal. It must not invent ROI, market statistics, regulatory clearance or integration availability.
- Cross-market transfer is framed as a pattern to consider, not a claim that two markets have equal economics.
- A six-analysis-per-hour, per-browser in-memory pilot limit prevents casual accidental overuse. It is not a distributed abuse-control system; use a shared rate-limit store before multi-replica/public scale.
- Frontend follows the existing Deep Signal visual language and adapts to mobile. The lab is a focused view without the persistent advisor composer; the explicit handoff button enters the advisor only after a result exists.

The model call currently uses the existing Replit OpenAI integration and JSON mode with strict local Zod validation. Official OpenAI documentation recommends Structured Outputs when the model endpoint supports it; the Replit-compatible model endpoint has not been live-verified for `json_schema`, so this implementation keeps the known working request shape and rejects malformed outputs. See [official Structured Outputs guidance](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat).

## Required deployment sequence

1. Apply `docs/migrations/2026-11-01-conversation-session-scope.sql` to the app's Postgres database. Do **not** deploy the API before the new column exists. The migration adds an indexed nullable owner hash; it does not delete existing rows.
2. Deploy the API and web build together. The advisor now issues a 30-day HttpOnly visitor cookie and scopes list, read, message, brief edit and voice-session routes to that visitor. Legacy conversations with no owner hash are intentionally not exposed. A returning browser with only an old localStorage conversation ID will start a new private session after the prior ID returns 404.
3. Confirm the hosted app uses HTTPS in production so the Secure cookie is set. Verify two separate browsers cannot list or retrieve each other's conversation IDs. Check the same browser can refresh, reopen its conversation and edit its brief.
4. Provision the existing Replit AI integration and database environment variables. Verify one sample Decision Lab request returns three valid paths. The local build verifies types and bundling, not live model quality or provider availability.
5. Before broad public traffic, add a distributed rate limiter, cost/latency telemetry without logging raw prompts, and structured-output support if the configured endpoint accepts it. Do not use the current in-memory pilot limit as a billing safety guarantee.

## Known product boundaries

The Decision Lab makes a provisional decision from visitor-supplied information. It does not browse the web, inspect the visitor's systems, calculate verified ROI, make a regulated decision, or implement a workflow. Results should be checked against real constraints before procurement or build commitments. The exported Markdown is local to the visitor's browser. Sending a result into the advisor creates a new stored conversation under that browser's private session.
