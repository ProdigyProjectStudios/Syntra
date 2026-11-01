# Syntra: three product bets

## Product thesis

Syntra can serve as an independent decision-to-delivery tool for any team considering AI or software change. The existing advisor, brief and booking flow are strong for consultancy discovery, but give a new visitor little useful output until they start a conversation. The product should offer value before a sales conversation, then make every further step more grounded and actionable.

The sequence is **decide → verify → run**. Each step should create a useful artifact that can be exported or carried forward. A consultancy engagement is an option when a user needs implementation help, not the only successful outcome.

## 1. Decision Lab — decide (implemented in this branch)

**User promise:** Describe a real operational or product bottleneck and get three credible routes, a recommended first experiment, the success signal, risks, assumptions and questions that could change the answer.

**Why first:** It provides a useful result in minutes for a visitor from almost any market. Showing a low-tech process or existing-tool path alongside AI and custom-build paths earns trust and makes a recommendation more meaningful. The four sample scenarios make the page usable immediately.

**Product and design:** A focused `/lab` page uses the existing Deep Signal visual language, with a two-column desktop layout and mobile stacking. Results have a clear recommendation, an exportable Markdown canvas and an explicit handoff to the advisor. The generated output is provisional and explains uncertainty; it does not claim verified ROI or regulatory approval.

**Success measure:** Among visitors who start an analysis, track completion, export, and advisor continuation separately. Review a small set of outputs across markets for specificity, credible non-build alternatives, unsupported claims and usefulness of first experiments. Do not optimize only for consultancy bookings.

## 2. Evidence Room — verify (next build)

**User promise:** Attach or connect the actual process notes, requirements, policy documents and system constraints behind a decision. Syntra links each important assertion to a source, flags contradictions and unknowns, and revises the decision canvas when evidence changes.

**Why it matters:** A single generated canvas is useful but cannot know a team's real systems or rules. Evidence grounding can make the tool valuable to product teams, operations leaders, agencies, education providers, property teams and other markets without pretending their economics are identical.

**Scope for a first release:** A private workspace with text and PDF ingestion, source citations at claim level, permission-aware sharing, an evidence coverage view, and a revision history for the canvas. Do not make claims about external market data unless a cited, dated source was actually retrieved. Add adversarial checks that ask what evidence would reverse the recommendation. Treat sensitive and regulated content as a deployment and data-governance design decision before opening uploads to the public.

**Premium interface:** A split view with the canvas on one side and cited evidence on the other; clicking a claim reveals the exact supporting excerpt and date. A small uncertainty panel replaces generic confidence badges with concrete missing evidence.

**Success measure:** Whether teams return with more evidence, revise a decision, and can trace the key recommendation to sources. A grounded answer with useful uncertainty is the quality target.

## 3. Action Studio — run (subsequent build)

**User promise:** Convert a selected experiment into an executable, measurable workflow: owner, inputs, acceptance criteria, human approval points, integration steps, evaluation cases and a live outcome scorecard.

**Why it matters:** The strongest recurring value comes after the recommendation. A user should be able to start a small pilot today, see whether it works, and decide to expand, change course or stop. This serves internal teams and partners as well as direct clients.

**Scope for a first release:** Reusable market-neutral experiment templates, editable milestones, test cases, human approvals, a sandbox or simulated run where safe, and outcome tracking. Add integrations in a narrow, explicit order driven by use. No arbitrary code execution from a generated plan; every proposed action needs a visible owner and permission boundary.

**Premium interface:** A compact execution map that shows what can start now, what depends on evidence or an integration, and what success looks like. The scorecard should compare the original hypothesis with observed results rather than present an AI-generated success claim.

**Success measure:** Experiments launched, completion rate, time from decision to first run, and validated outcome against the initial success signal. These metrics matter more than generated-plan volume.

## Architecture and release order

The current branch establishes the first wedge and a visitor-session privacy boundary for stored advisor conversations. Decision Lab results are generated on demand and are not saved by the Lab. The advisor handoff deliberately starts a stored conversation under the visitor's session.

Before a public release, apply the database migration in `docs/migrations/2026-11-01-conversation-session-scope.sql`, verify cookies and cross-browser isolation on HTTPS, test the configured model endpoint, and replace the in-memory rate limit with a shared cost control if traffic grows. Evidence Room should follow only after storage, retention, permissions and citation quality are designed. Action Studio should follow once the recommendation and evidence objects have stable IDs and revision history.
