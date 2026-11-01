# Syntra Action Studio

Action Studio at `/action` turns a proposed experiment into a pilot plan and a manual outcome scorecard. It is an independent product path for teams across markets, not a consultancy intake form.

## Implemented pilot

- Three immediately usable sample experiments and a freeform input for market, experiment, success signal and constraints.
- Stateless `POST /api/action/plan` with bounded input, Zod-validated model output and a four-plans-per-hour in-memory visitor limit.
- Generated falsifiable hypothesis, decision rule, measurement plan, sequential milestones, suggested owner roles, acceptance criteria, approval gates, evaluation cases, assumptions and stop conditions.
- Editable milestones, owner roles, acceptance criteria, approval gates and evaluation cases. A user can add or remove steps and record progress.
- Manual scorecard for a real baseline, observed result, evidence note and team verdict. The app never automatically marks an outcome as successful.
- Markdown export of the current edited plan and observations. A user can explicitly save, restore or clear one draft in this browser's localStorage. Saving is manual; subsequent edits need another save. The API does not persist the input or result. A sessionStorage seed can populate the form from another Syntra flow via `syntra.action.seed` with `{ market, experiment, successSignal, constraints }`.

## Product boundaries

The tool creates a draft plan from visitor-supplied information. It does not run integrations, send messages, execute code, access systems, verify a baseline or measure results. Generated owner roles and gates require human confirmation. No secrets or sensitive personal data should be entered into this pilot. Browser-saved drafts are available only in that browser profile and have no cloud sync or team permissions. In regulated or high-stakes domains, the plan is a starting point for qualified human review.

The in-memory per-visitor limit is only a pilot guard. Add shared rate limiting and cost telemetry before multi-replica/public scale. Confirm the configured AI endpoint returns valid plans in a hosted environment; a local typecheck cannot establish model quality.

## API contract for integration

`POST /api/action/plan`

Request: `market` (2–80 chars), `experiment` (40–2000), `successSignal` (10–400), optional `constraints` (up to 1000).

Response: `title`, `hypothesis`, `decisionRule`, `measurement` (`metric`, `baselineNeeded`, `observationMethod`, `reviewPoint`), `milestones[]` (`name`, `deliverable`, `ownerRole`, `acceptanceCriteria`, `approvalGate` nullable), `evaluationCases[]` (`scenario`, `expectedBehavior`, `failureSignal`), `assumptions[]`, `stopConditions[]`.

The parent integration should register `actionRouter`, add `/action` navigation, and optionally pass the selected Decision Lab first experiment into the seed key. Add this endpoint to OpenAPI and regenerate the API clients once the route and page are registered.
