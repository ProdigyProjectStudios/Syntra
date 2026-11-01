# Intelligence tools release checks

Implemented flow: Decision Lab (`/lab`) → Evidence Room (`/evidence`) → Action Studio (`/action`). Each tool is also independently usable with illustrative sample inputs. Original constraints are carried into downstream inputs. A paused evidence review routes to evidence collection before implementation.

Evidence Room imports text excerpts (.txt/.md/.csv/.json), validates returned quotations against the supplied text, and shows the cited source. It does not independently establish whether a source or a model's interpretation is true. Invalid citations force a paused review. PDF parsing, connected sources and shared team storage are not included.

Action Studio produces an editable experiment plan and a manually completed scorecard. Save/restore/clear controls persist a draft only when requested, in the current browser. There is no cloud synchronization or external workflow execution.

## Verification on 2026-11-01

- Full workspace typecheck and production build passed.
- Five focused evidence citation tests passed, covering exact/normalized quotes, fabricated or missing citations, and invalid conflict evidence. Tests used dummy provider configuration and made no model request.
- Browser QA with synthetic API fixtures verified evidence rendering, source inspection, Evidence Room → Action Studio handoff, editable owner role, explicit save and restore after refresh.
- Desktop and 390px mobile layout inspected. Existing bundle-size and sourcemap build warnings remain.
- Live model output quality, hosted latency, provider availability and database integration were not tested locally.

## Deployment

Follow `DECISION-LAB.md`: apply the conversation owner migration before deploying the API, verify HTTPS cookies and cross-browser isolation, and review legacy history handling. Test one real request to each of the three model endpoints with approved sample data. Use shared rate limiting and cost telemetry before broad traffic; per-process visitor limits are pilot controls. Review provider data-retention settings before accepting sensitive content. No deployment or database migration was performed during this build.
