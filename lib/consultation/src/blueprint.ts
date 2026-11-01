import type { Brief, BriefKey, SpecialistId } from './types.ts';
import { ConsultationError } from './engine.ts';
import { PORTFOLIO_EXAMPLES, SERVICE_AREAS } from './business.ts';
import { isSpecialistId, normalizeSpecialist } from './specialists.ts';

export const BLUEPRINT_SECTIONS = [
  { id: 'objectives', label: 'Business objectives', description: 'The outcome, operational problem and confirmed requirements.' },
  { id: 'services', label: 'Service fit & evidence', description: 'Relevant Digital Prodigy directions and published work.' },
  { id: 'architecture', label: 'System architecture', description: 'Components, data boundaries and the path through the system.' },
  { id: 'integrations', label: 'Integration map', description: 'Named systems, access assumptions and checks before implementation.' },
  { id: 'workflows', label: 'Automation workflows', description: 'Triggers, actions, exceptions, approvals and expected outcomes.' },
  { id: 'roadmap', label: 'Phased implementation', description: 'A practical MVP sequence with dependencies and acceptance checks.' },
  { id: 'risks', label: 'Security & reliability', description: 'Data protection, operational risks and recovery requirements.' },
  { id: 'tradeoffs', label: 'Options & trade-offs', description: 'Alternatives and the conditions that change the recommendation.' },
  { id: 'value', label: 'Business-value scenarios', description: 'Transparent arithmetic using supplied numbers or labelled assumptions.' },
  { id: 'decisions', label: 'Decisions & next steps', description: 'What needs agreement before the next useful step.' },
] as const;
export type BlueprintSectionKey = (typeof BLUEPRINT_SECTIONS)[number]['id'];
export type BlueprintStatus = 'confirmed' | 'recommendation' | 'assumption' | 'manual';
export interface BlueprintDetail { label: string; value: string }
export interface BlueprintQuantity { value: number; status: 'confirmed' | 'assumption'; evidence: string }
export interface BlueprintCalculation {
  monthlyVolume: BlueprintQuantity;
  minutesBefore: BlueprintQuantity;
  minutesAfter: BlueprintQuantity;
  hourlyCost?: BlueprintQuantity;
  /** Unit for the illustrative hourly cost, never a studio price or ROI claim. */
  currency?: string;
}
export interface BlueprintItem {
  id: string;
  title: string;
  detail: string;
  status: BlueprintStatus;
  evidence: string;
  specialist: SpecialistId;
  source: 'brief' | 'specialist' | 'manual';
  reviewRequired?: boolean;
  details?: BlueprintDetail[];
  calculation?: BlueprintCalculation;
}
export interface BlueprintHistoryItem { title: string; detail: string; status: BlueprintStatus }
export interface BlueprintChangeRecord {
  section: BlueprintSectionKey;
  itemId: string;
  before: BlueprintHistoryItem | null;
  after: BlueprintHistoryItem | null;
}
export interface BlueprintVersion {
  version: number;
  createdAt: string;
  source: 'brief' | 'specialist' | 'manual' | 'regenerate';
  specialist: SpecialistId;
  changedSections: BlueprintSectionKey[];
  changes: BlueprintChangeRecord[];
}
export interface Blueprint {
  version: number;
  briefRevision: number;
  updatedAt: string;
  sections: Record<BlueprintSectionKey, BlueprintItem[]>;
  history: BlueprintVersion[];
  /** Section/id tombstones preserve intentional removals during future generation. */
  removedItemIds: string[];
}
export interface BlueprintContribution {
  section: BlueprintSectionKey;
  id: string;
  title: string;
  detail: string;
  status: Exclude<BlueprintStatus, 'manual'>;
  evidence: string;
  details?: BlueprintDetail[];
  calculation?: BlueprintCalculation;
}
export interface BlueprintEdit {
  section: BlueprintSectionKey;
  itemId: string;
  title?: string;
  detail?: string;
  details?: BlueprintDetail[];
  remove?: boolean;
}
export interface BlueprintMutation { version: number; requestId: string }
export interface BlueprintUpdateInput extends BlueprintMutation { edit: BlueprintEdit }
export interface BlueprintContext {
  visitorHistory: string[];
  latest: string;
  specialist?: SpecialistId;
  now?: string;
  source?: 'brief' | 'specialist' | 'regenerate';
}
export const BLUEPRINT_LIMITS = { itemsPerSection: 8, title: 160, detail: 1200, evidence: 2000,
  details: 6, detailLabel: 60, detailValue: 300, textCharacters: 60000, serializedCharacters: 260000, history: 5, changesPerVersion: 24 } as const;

export const BLUEPRINT_BRIEF_FIELDS: Readonly<Record<string, BriefKey>> = {
  brief_objective: 'objective', brief_requirements: 'requirements', brief_service: 'service',
  brief_integrations: 'integrations', brief_budget: 'budget', brief_timeline: 'timeline',
  brief_nextstep: 'nextStep', brief_solution: 'proposedSolution',
};
const keys = BLUEPRINT_SECTIONS.map(section => section.id);
const statuses: BlueprintStatus[] = ['confirmed', 'recommendation', 'assumption', 'manual'];
const sources = ['brief', 'specialist', 'manual', 'regenerate'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validKey = (value: unknown): value is BlueprintSectionKey => keys.includes(value as BlueprintSectionKey);
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
const bounded = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || !!value.trim());
const quote = (value: string) => value.trim().replace(/^["“‘'`]|["”’'`]$/g, '').trim();
const evidenceIn = (evidence: string, history: string[]) => !!quote(evidence) && history.some(text => text.toLowerCase().includes(quote(evidence).toLowerCase()));
const token = (section: BlueprintSectionKey, id: string) => `${section}/${id}`;
function validDetails(value: unknown): value is BlueprintDetail[] {
  return Array.isArray(value) && value.length <= BLUEPRINT_LIMITS.details && value.every(detail => record(detail) &&
    bounded(detail.label, BLUEPRINT_LIMITS.detailLabel) && bounded(detail.value, BLUEPRINT_LIMITS.detailValue));
}
function validQuantity(value: unknown, maximum: number): value is BlueprintQuantity {
  return record(value) && typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0 && value.value <= maximum &&
    (value.status === 'confirmed' || value.status === 'assumption') && bounded(value.evidence, BLUEPRINT_LIMITS.evidence);
}
function validCalculation(value: unknown): value is BlueprintCalculation {
  return record(value) && validQuantity(value.monthlyVolume, 100000000) && validQuantity(value.minutesBefore, 100000) &&
    validQuantity(value.minutesAfter, 100000) && value.minutesAfter.value <= value.minutesBefore.value &&
    (value.hourlyCost === undefined || validQuantity(value.hourlyCost, 1000000)) &&
    (value.currency === undefined || (typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency)));
}
function validItem(value: unknown): value is BlueprintItem {
  return record(value) && validId(value.id) && bounded(value.title, BLUEPRINT_LIMITS.title) && bounded(value.detail, BLUEPRINT_LIMITS.detail) &&
    statuses.includes(value.status as BlueprintStatus) && bounded(value.evidence, BLUEPRINT_LIMITS.evidence, true) && isSpecialistId(value.specialist) &&
    ['brief', 'specialist', 'manual'].includes(value.source as string) && (value.reviewRequired === undefined || typeof value.reviewRequired === 'boolean') &&
    (value.details === undefined || validDetails(value.details)) && (value.calculation === undefined || validCalculation(value.calculation));
}
const textSize = (sections: Blueprint['sections']) => keys.reduce((sum, key) => sum + sections[key].reduce((count, item) =>
  count + item.title.length + item.detail.length + item.evidence.length + (item.details ?? []).reduce((n, entry) => n + entry.label.length + entry.value.length, 0), 0), 0);
export function emptyBlueprint(): Blueprint {
  return { version: 0, briefRevision: 0, updatedAt: '', sections: Object.fromEntries(keys.map(key => [key, []])) as unknown as Blueprint['sections'], history: [], removedItemIds: [] };
}
/** Invalid stored documents fail closed; never quietly replace customer edits. */
export function normalizeStoredBlueprint(value: unknown): Blueprint {
  if (value === undefined || value === null) return emptyBlueprint();
  const invalid = () => new ConsultationError(409, 'The saved Blueprint could not be read safely. Its content has not been replaced.');
  if (JSON.stringify(value).length > BLUEPRINT_LIMITS.serializedCharacters) throw invalid();
  if (!record(value) || !Number.isSafeInteger(value.version) || (value.version as number) < 0 ||
      !Number.isSafeInteger(value.briefRevision) || (value.briefRevision as number) < 0 ||
      typeof value.updatedAt !== 'string' || (value.version !== 0 && !Number.isFinite(Date.parse(value.updatedAt))) || !record(value.sections) ||
      !Array.isArray(value.history) || value.history.length > BLUEPRINT_LIMITS.history || !Array.isArray(value.removedItemIds) || value.removedItemIds.length > 128) throw invalid();
  for (const section of keys) {
    const items = value.sections[section];
    if (!Array.isArray(items) || items.length > BLUEPRINT_LIMITS.itemsPerSection || !items.every(validItem) || new Set(items.map(item => item.id)).size !== items.length) throw invalid();
  }
  if (textSize(value.sections as Blueprint['sections']) > BLUEPRINT_LIMITS.textCharacters || value.removedItemIds.some(id => typeof id !== 'string' ||
      !keys.some(key => id.startsWith(`${key}/`) && validId(id.slice(key.length + 1))))) throw invalid();
  for (const revision of value.history) {
    if (!record(revision) || !Number.isSafeInteger(revision.version) || (revision.version as number) < 1 || (revision.version as number) > (value.version as number) ||
        !bounded(revision.createdAt, 40) || !Number.isFinite(Date.parse(revision.createdAt)) || !sources.includes(revision.source as string) || !isSpecialistId(revision.specialist) ||
        !Array.isArray(revision.changedSections) || revision.changedSections.length > keys.length || !revision.changedSections.every(validKey) ||
        !Array.isArray(revision.changes) || revision.changes.length > BLUEPRINT_LIMITS.changesPerVersion) throw invalid();
    for (const change of revision.changes) {
      if (!record(change) || !validKey(change.section) || !validId(change.itemId)) throw invalid();
      for (const snapshot of [change.before, change.after]) {
        if (snapshot !== null && (!record(snapshot) || !bounded(snapshot.title, 160) || !bounded(snapshot.detail, 260) || !statuses.includes(snapshot.status as BlueprintStatus))) throw invalid();
      }
    }
  }
  return structuredClone(value) as unknown as Blueprint;
}
/** Untrusted model patches cannot supply provenance ownership, manual status or revisions. */
export function parseBlueprintContributions(value: unknown): BlueprintContribution[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap(item => {
    if (!record(item) || !validKey(item.section) || !validId(item.id) || item.id.startsWith('brief_') || item.id.startsWith('plan_') ||
        !bounded(item.title, 160) || !bounded(item.detail, 1200) || !['confirmed', 'recommendation', 'assumption'].includes(item.status as string) ||
        !bounded(item.evidence, 2000) || (item.details !== undefined && !validDetails(item.details)) ||
        (item.calculation !== undefined && (item.section !== 'value' || !validCalculation(item.calculation))) || (item.section === 'value' && !validCalculation(item.calculation))) return [];
    return [{ section: item.section, id: item.id, title: item.title.trim(), detail: item.detail.trim(), status: item.status as BlueprintContribution['status'],
      evidence: quote(item.evidence), ...(item.details ? { details: structuredClone(item.details) as BlueprintDetail[] } : {}),
      ...(item.calculation ? { calculation: structuredClone(item.calculation) as BlueprintCalculation } : {}) }];
  });
}

function baseline(brief: Brief): Blueprint['sections'] {
  const sections = emptyBlueprint().sections;
  const add = (section: BlueprintSectionKey, id: string, title: string, detail: string, details?: BlueprintDetail[]) => {
    sections[section].push({ id, title, detail: detail.slice(0, 1200), status: 'recommendation', evidence: 'Planning recommendation based on the current project brief.',
      specialist: 'syntra', source: 'brief', ...(details ? { details } : {}) });
  };
  const field = (section: BlueprintSectionKey, id: string, title: string, key: BriefKey) => {
    if (!brief[key]) return;
    const provenance = brief.provenance[key];
    sections[section].push({ id, title, detail: brief[key]!.slice(0, 1200), status: provenance?.status === 'manual' ? 'manual' : provenance?.status === 'suggested' ? 'recommendation' : provenance?.status === 'confirmed' ? 'confirmed' : 'assumption',
      evidence: (provenance?.evidence ?? 'Existing project brief; review its source with the visitor.').slice(0, 2000), specialist: 'syntra', source: 'brief', ...(!provenance ? { reviewRequired: true } : {}) });
  };
  field('objectives', 'brief_objective', 'Desired business outcome', 'objective');
  field('objectives', 'brief_requirements', 'Required workflow & capabilities', 'requirements');
  field('services', 'brief_service', brief.provenance.service?.status === 'suggested' ? 'Proposed project direction' : 'Current project direction', 'service');
  field('architecture', 'brief_solution', 'Proposed first build', 'proposedSolution');
  field('integrations', 'brief_integrations', 'Systems named in the brief', 'integrations');
  field('roadmap', 'brief_budget', 'Budget constraint', 'budget');
  field('roadmap', 'brief_timeline', 'Timing constraint', 'timeline');
  field('decisions', 'brief_nextstep', brief.provenance.nextStep?.status === 'suggested' ? 'Proposed next step' : 'Current next step', 'nextStep');
  if (!brief.objective && !brief.proposedSolution && !brief.requirements) return sections;
  const goal = (brief.objective ?? brief.proposedSolution ?? brief.requirements!).slice(0, 300);
  const project = Object.values(brief).filter(value => typeof value === 'string').join(' ');
  const serviceIds = new Set<string>();
  const selectedService = SERVICE_AREAS.find(service => brief.service?.trim().toLowerCase() === service.name.toLowerCase());
  if (selectedService) serviceIds.add(selectedService.id);
  else {
    if (/automat|workflow|invoice|repetitive|manual/i.test(project)) serviceIds.add('ai-automation');
    if (/portal|dashboard|approval|client/i.test(project)) serviceIds.add('client-portals');
    if (/saas|mvp|ai product|subscription/i.test(project)) serviceIds.add('ai-mvp-saas');
    if (/\bui\b|interface|design system|prototype/i.test(project)) serviceIds.add('premium-product-ui');
  }
  if (!brief.service && serviceIds.size) {
    const service = SERVICE_AREAS.find(item => serviceIds.has(item.id))!;
    add('services', 'plan_service_fit', `Consider ${service.name}`, `${service.description} Validate fit against the priority outcome: ${goal}`);
  }
  const example = PORTFOLIO_EXAMPLES.find(item => item.serviceIds.some(id => serviceIds.has(id)));
  if (example) add('services', 'plan_portfolio', `Published example: ${example.name}`, `${example.summary} Relevant as a design reference, not proof of equivalent scope, customer results or a ready-made integration.`, [
    { label: 'Source', value: example.sourceUrl }, { label: 'Reviewed', value: example.verifiedOn },
  ]);
  add('architecture', 'plan_boundaries', 'Separate the interface, business rules and data', `Design one end-to-end path for: ${goal}. Keep access checks and business rules on the server; let the interface show progress, decisions and recoverable errors.`, [
    { label: 'Components', value: 'User workspace; authenticated application API; project records; audit history.' },
    { label: 'Data flow', value: 'Authorized input → validation → saved work item → review → approved outcome.' },
    { label: 'Decision', value: 'Confirm user roles, ownership rules and the authoritative system before selecting a stack.' },
  ]);
  if (brief.integrations) {
    add('integrations', 'plan_access_check', 'Verify each integration before committing scope', `Treat ${brief.integrations.slice(0, 250)} as named systems, not connected services. Confirm access, documented operations and the authoritative record.`, [
      { label: 'Verification', value: 'Check vendor API availability, authentication, least-privilege scopes, sandbox and rate limits.' },
      { label: 'Failure behavior', value: 'Retry bounded transient failures; deduplicate writes; send ambiguous outcomes for human review.' },
      { label: 'Data flow', value: 'Document source → minimum required fields → approved destination; retain a traceable outcome.' },
    ]);
  }
  add('workflows', 'plan_pilot', 'Pilot one workflow with a human checkpoint', `Choose the smallest repeatable slice that advances: ${goal}. Validate it on representative examples before widening access or automating consequential actions.`, [
    { label: 'Trigger', value: 'Agree the source event and who owns a work item; this remains a design decision.' },
    { label: 'Actions', value: 'Collect the required input → validate → prepare a draft or decision → record the outcome.' },
    { label: 'Exceptions', value: 'Missing data, duplicate events, uncertain provider outcomes and permission failures go to a visible review queue.' },
    { label: 'Human approval', value: 'Require an authorized reviewer before irreversible external changes or customer communications.' },
    { label: 'Outcome', value: 'Measure completion time and quality against the current process; define acceptable thresholds with the team.' },
  ]);
  add('roadmap', 'plan_phase_1', '1 · Validate the thin slice', 'Confirm the workflow owner, success criterion, real sample inputs, access constraints and excluded scope.', [
    { label: 'Priority', value: 'First: resolve the assumptions that could make the proposed build impractical.' },
    { label: 'Acceptance', value: 'The owner can walk through a representative case and approve the first-release boundary.' },
  ]);
  add('roadmap', 'plan_phase_2', '2 · Build an observable MVP', 'Implement the agreed end-to-end path, persistent records, role checks and an explicit review step.', [
    { label: 'Dependency', value: 'Approved phase-one scope and verified access to any required external systems.' },
    { label: 'Acceptance', value: 'Representative happy-path and exception cases complete without hidden manual work or duplicate side effects.' },
  ]);
  add('roadmap', 'plan_phase_3', '3 · Pilot, recover and expand', 'Run a controlled pilot; test replay, failure recovery and data access before increasing users or automating more actions.', [
    { label: 'Dependency', value: 'Working MVP, named operational owner and agreed pilot acceptance criteria.' },
    { label: 'Release gate', value: 'Review observed quality, effort and exceptions; agree the next phase from evidence, not assumed ROI.' },
  ]);
  add('risks', 'plan_access', 'Enforce access and data boundaries', 'Validate authorization on the server, minimize personal data, keep credentials in managed server storage and agree retention/deletion rules. Confirm tenant boundaries where multiple clients share the product.');
  add('risks', 'plan_recovery', 'Design for uncertain external outcomes', 'Persist intent before consequential operations, use provider-supported idempotency where available, bound retries and provide manual reconciliation when completion cannot be proved. Never treat a timeout as proof that an action did not happen.');
  add('tradeoffs', 'plan_options', 'Configure an existing workflow or build a focused product', 'Start by checking whether existing systems can support the agreed thin slice. A configured workflow may reduce build scope but is constrained by vendor access and permissions; a custom product gives explicit control over experience and data but requires more operational ownership.', [
    { label: 'Decision condition', value: 'Prefer the smallest option that meets the verified permission, exception and audit requirements.' },
  ]);
  if (!brief.integrations) add('decisions', 'plan_system_decision', 'Identify the source of truth', 'Which existing system owns the input and final result? Verify access before promising an integration.');
  if (!brief.requirements) add('decisions', 'plan_scope_decision', 'Choose one high-value case', 'Agree the workflow, user role and exception that the first release must handle; defer secondary features until the pilot teaches us more.');
  if (!brief.budget || !brief.timeline) add('decisions', 'plan_constraints', 'Set a feasible first-phase boundary', 'Confirm the investment range and timing constraints, or explicitly keep them undecided. The roadmap is a sequence of work, not a quoted price or delivery commitment.');
  return sections;
}

function numericEvidence(quantity: BlueprintQuantity, history: string[], kind: 'volume' | 'minutes' | 'cost'): boolean {
  if (quantity.status === 'assumption') return true;
  if (!evidenceIn(quantity.evidence, history)) return false;
  // Bind the number to its unit and period; an invoice count elsewhere in the
  // same quote cannot justify an hourly cost or a monthly workload.
  const number = String.raw`(\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|thousand|million)?)`;
  const count = String.raw`(?:cases?|invoices?|orders?|tickets?|tasks?|items?|requests?|leads?|documents?|transactions?|records?|approvals?|reviews?|runs?|reports?|messages?|emails?)`;
  const patterns = kind === 'volume' ? [
    `${number}\\s*${count}\\s*(?:(?:a|per|each|every|/)\\s*)?month(?:ly)?\\b`,
    `\\bmonthly\\s+(?:volume(?:\\s+of)?\\s+)?${number}\\s*${count}\\b`,
  ] : kind === 'minutes' ? [`${number}\\s*(?:minutes?|mins?)\\b`] : [
    `(?:[A-Z]{3}\\s*|[$£€]\\s*)?${number}\\s*(?:[A-Z]{3}\\s*)?(?:per|an|a|each|/)\\s*(?:hour|hr)\\b`,
    `\\bhourly\\s+(?:(?:cost|rate|value)\\s*)?(?:(?:of|is|:)\\s*)?(?:[A-Z]{3}\\s*|[$£€]\\s*)?${number}\\b`,
  ];
  return patterns.some(pattern => [...quantity.evidence.matchAll(new RegExp(pattern, 'gi'))].some(match => {
    const text = match[1].replaceAll(',', '').trim();
    const scale = /million$/i.test(text) ? 1000000 : /(?:k|thousand)$/i.test(text) ? 1000 : 1;
    return Math.abs(Number.parseFloat(text) * scale - quantity.value) < 0.000001;
  }));
}
function calculatedItem(contribution: BlueprintContribution, context: BlueprintContext): BlueprintItem | null {
  const calculation = contribution.calculation;
  if (!calculation || !validCalculation(calculation)) return null;
  const quantities = [calculation.monthlyVolume, calculation.minutesBefore, calculation.minutesAfter, ...(calculation.hourlyCost ? [calculation.hourlyCost] : [])];
  if (!numericEvidence(calculation.monthlyVolume, context.visitorHistory, 'volume') ||
      !numericEvidence(calculation.minutesBefore, context.visitorHistory, 'minutes') ||
      !numericEvidence(calculation.minutesAfter, context.visitorHistory, 'minutes') ||
      (calculation.hourlyCost && !numericEvidence(calculation.hourlyCost, context.visitorHistory, 'cost'))) return null;
  const hours = calculation.monthlyVolume.value * (calculation.minutesBefore.value - calculation.minutesAfter.value) / 60;
  const assumption = quantities.some(quantity => quantity.status === 'assumption');
  const label = (quantity: BlueprintQuantity, suffix: string) => `${quantity.value.toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${suffix} · ${quantity.status === 'assumption' ? 'assumption' : 'visitor supplied'}`;
  const details: BlueprintDetail[] = [
    { label: 'Monthly volume', value: label(calculation.monthlyVolume, 'cases') },
    { label: 'Current effort', value: label(calculation.minutesBefore, 'minutes per case') },
    { label: 'Proposed effort', value: label(calculation.minutesAfter, 'minutes per case') },
    { label: 'Potential capacity', value: `${hours.toLocaleString('en-GB', { maximumFractionDigits: 2 })} hours/month; verify through a pilot.` },
  ];
  if (calculation.hourlyCost) {
    const currencyKnown = calculation.hourlyCost.status === 'assumption' || (calculation.currency && new RegExp(`\\b${calculation.currency}\\b`, 'i').test(calculation.hourlyCost.evidence));
    const unit = currencyKnown && calculation.currency ? calculation.currency : 'currency units';
    details.push({ label: 'Capacity valuation', value: `${(hours * calculation.hourlyCost.value).toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${unit}/month at ${label(calculation.hourlyCost, 'per hour')}; not realized cash savings.` });
  }
  details.push({ label: 'Method', value: 'Monthly cases × (current minutes − proposed minutes) ÷ 60. Excludes implementation cost, adoption and quality effects.' });
  return { id: contribution.id, title: 'Illustrative monthly capacity', detail: 'A scenario for discussion, not a guaranteed outcome, quoted price or ROI. Validate the proposed effort and exception rate on a representative pilot before treating this as a forecast.',
    status: assumption ? 'assumption' : 'recommendation', evidence: quantities.map(quantity => `${quantity.status}: ${quote(quantity.evidence)}`).join(' | ').slice(0, 2000),
    specialist: normalizeSpecialist(context.specialist), source: 'specialist', details, calculation: structuredClone(calculation) };
}
function historyItem(item: BlueprintItem | undefined, other?: BlueprintItem): BlueprintHistoryItem | null {
  if (!item) return null;
  let detail = `${item.reviewRequired ? 'Needs review: ' : ''}${item.detail}`;
  if (other && item.detail === other.detail && !!item.reviewRequired === !!other.reviewRequired) {
    const changedNotes = (item.details ?? []).filter(row => !(other.details ?? []).some(previous => previous.label === row.label && previous.value === row.value));
    if (changedNotes.length) detail = `Changed notes: ${changedNotes.map(row => `${row.label}: ${row.value}`).join('; ')}`;
    else if (item.evidence !== other.evidence) detail = `Evidence / basis: ${item.evidence}`;
  }
  return { title: item.title, detail: detail.slice(0, 240), status: item.status };
}
function finish(previous: Blueprint, next: Blueprint, source: BlueprintVersion['source'], specialist: SpecialistId, now = new Date().toISOString()): Blueprint {
  const changes: BlueprintChangeRecord[] = [];
  const changedSections: BlueprintSectionKey[] = [];
  for (const section of keys) {
    const before = new Map(previous.sections[section].map(item => [item.id, item]));
    const after = new Map(next.sections[section].map(item => [item.id, item]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if (JSON.stringify(before.get(id)) === JSON.stringify(after.get(id))) continue;
      if (!changedSections.includes(section)) changedSections.push(section);
      changes.push({ section, itemId: id, before: historyItem(before.get(id), after.get(id)), after: historyItem(after.get(id), before.get(id)) });
    }
  }
  if (!changes.length && previous.briefRevision === next.briefRevision && JSON.stringify(previous.removedItemIds) === JSON.stringify(next.removedItemIds)) return previous;
  if (!Number.isFinite(Date.parse(now))) throw new ConsultationError(400, 'Blueprint update time is invalid.');
  if (textSize(next.sections) > BLUEPRINT_LIMITS.textCharacters) throw new ConsultationError(422, 'This Blueprint is full. Shorten an existing item before adding more detail.');
  next.version = previous.version + 1;
  next.updatedAt = now;
  next.history = [...previous.history, { version: next.version, createdAt: now, source, specialist, changedSections,
    changes: changes.slice(0, BLUEPRINT_LIMITS.changesPerVersion) }].slice(-BLUEPRINT_LIMITS.history);
  // Visible text alone excludes JSON escaping, quantity evidence and history.
  // Apply the same complete-document bound as the reader before any caller can
  // persist a document that would be rejected on the next load.
  if (JSON.stringify(next).length > BLUEPRINT_LIMITS.serializedCharacters) {
    throw new ConsultationError(422, 'This Blueprint exceeds its storage limit. Shorten an existing item before saving. Your previous version is preserved.');
  }
  return next;
}

/** Deterministic brief synchronization plus bounded model deltas. Never invokes a model. */
export function evolveBlueprint(current: Blueprint | undefined, brief: Brief, contributions: BlueprintContribution[] = [], context: BlueprintContext = { visitorHistory: [], latest: '' }): Blueprint {
  const previous = normalizeStoredBlueprint(current);
  const next = structuredClone(previous);
  const seed = baseline(brief);
  const briefChanged = previous.briefRevision !== brief.revision;
  const specialist = normalizeSpecialist(context.specialist);
  next.briefRevision = brief.revision;
  for (const section of keys) {
    const retained = previous.sections[section].filter(item => item.source !== 'brief');
    const items: BlueprintItem[] = retained.map(item => briefChanged ? { ...item, reviewRequired: true } : item);
    for (const candidate of seed[section]) {
      if (next.removedItemIds.includes(token(section, candidate.id))) continue;
      const old = items.find(item => item.id === candidate.id);
      if (!old && items.length < BLUEPRINT_LIMITS.itemsPerSection) items.push(candidate);
    }
    // Canonical brief fields always come from the latest brief, including manual corrections.
    // Reserve their space before optional specialist detail when a section is full.
    for (const fact of seed[section].filter(item => Object.hasOwn(BLUEPRINT_BRIEF_FIELDS, item.id))) {
      if (items.some(item => item.id === fact.id)) continue;
      if (items.length === BLUEPRINT_LIMITS.itemsPerSection) {
        let replaceable = -1;
        for (let index = items.length - 1; index >= 0; index--) {
          if (items[index].source !== 'manual' && !Object.hasOwn(BLUEPRINT_BRIEF_FIELDS, items[index].id)) { replaceable = index; break; }
        }
        if (replaceable < 0) continue;
        items.splice(replaceable, 1);
      }
      items.unshift(fact);
    }
    next.sections[section] = items;
  }
  for (const contribution of parseBlueprintContributions(contributions)) {
    const section = next.sections[contribution.section];
    const old = section.find(item => item.id === contribution.id);
    if (old?.status === 'manual' || next.removedItemIds.includes(token(contribution.section, contribution.id))) continue;
    if (contribution.status === 'confirmed') {
      // A quoted business need is not proof that an invented component exists.
      // Confirmed specialist facts must retain the visitor's own factual wording.
      const factual = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!evidenceIn(contribution.evidence, context.visitorHistory) || !factual(contribution.evidence).includes(factual(contribution.detail))) continue;
    }
    if (contribution.status !== 'assumption' && !evidenceIn(contribution.evidence, context.visitorHistory)) continue;
    if (old?.status === 'confirmed' && contribution.status !== 'confirmed') continue;
    if (old?.status === 'confirmed' && (old.detail !== contribution.detail || old.reviewRequired) && !evidenceIn(contribution.evidence, [context.latest])) continue;
    const { section: _section, ...content } = contribution;
    if (contribution.status === 'confirmed') {
      // Free-form headings and row labels can otherwise reinterpret a valid quote.
      content.title = 'Visitor-confirmed context';
      delete content.details;
    }
    const item: BlueprintItem | null = contribution.section === 'value' ? calculatedItem(contribution, context) : {
      ...content, specialist, source: 'specialist', reviewRequired: false,
    };
    if (!item) continue;
    const index = section.findIndex(entry => entry.id === item.id);
    if (index < 0 && section.length >= BLUEPRINT_LIMITS.itemsPerSection) continue;
    const candidate = structuredClone(next.sections);
    if (index < 0) candidate[contribution.section].push(item); else candidate[contribution.section][index] = item;
    if (textSize(candidate) <= BLUEPRINT_LIMITS.textCharacters) next.sections = candidate;
  }
  return finish(previous, next, context.source ?? (contributions.length ? 'specialist' : 'brief'), specialist, context.now);
}

export function manualBlueprint(current: Blueprint, edit: BlueprintEdit, version: number): Blueprint {
  const previous = normalizeStoredBlueprint(current);
  if (previous.version !== version) throw new ConsultationError(409, 'The Blueprint changed. Review the latest version before saving.');
  if (!record(edit) || !validKey(edit.section) || !validId(edit.itemId) ||
      (edit.remove !== undefined && typeof edit.remove !== 'boolean')) throw new ConsultationError(400, 'Choose a valid Blueprint item.');
  if (Object.hasOwn(BLUEPRINT_BRIEF_FIELDS, edit.itemId)) throw new ConsultationError(409, 'Edit this fact in the project brief so the conversation and Blueprint stay consistent.');
  const next = structuredClone(previous);
  const index = next.sections[edit.section].findIndex(item => item.id === edit.itemId);
  if (index < 0) throw new ConsultationError(404, 'Blueprint item not found.');
  const item = next.sections[edit.section][index];
  if (edit.remove) {
    if (previous.removedItemIds.length >= 128) throw new ConsultationError(422, 'This Blueprint has reached its edit history limit.');
    next.sections[edit.section].splice(index, 1);
    next.removedItemIds.push(token(edit.section, edit.itemId));
  } else {
    if ((edit.title !== undefined && !bounded(edit.title, 160)) || (edit.detail !== undefined && !bounded(edit.detail, 1200)) ||
        (edit.details !== undefined && !validDetails(edit.details))) throw new ConsultationError(400, 'Use a title up to 160 characters, detail up to 1200 characters and at most six short notes.');
    if (item.calculation && edit.details !== undefined && JSON.stringify(edit.details) !== JSON.stringify(item.details)) {
      throw new ConsultationError(400, 'Calculated scenario notes come from the source quantities. Remove this scenario or supply corrected quantities in the consultation.');
    }
    next.sections[edit.section][index] = { ...item,
      ...(edit.title !== undefined ? { title: edit.title.trim() } : {}), ...(edit.detail !== undefined ? { detail: edit.detail.trim() } : {}),
      ...(edit.details !== undefined ? { details: structuredClone(edit.details) } : {}), status: 'manual', source: 'manual',
      evidence: 'Edited in the Solution Blueprint', reviewRequired: false,
    };
  }
  return finish(previous, next, 'manual', item.specialist);
}

const focus: Record<SpecialistId, BlueprintSectionKey[]> = {
  syntra: ['objectives', 'services', 'decisions', 'roadmap'],
  technical: ['architecture', 'integrations', 'risks', 'tradeoffs', 'roadmap'],
  automation: ['workflows', 'integrations', 'value', 'decisions', 'risks'],
};
/** Bounded specialist context only: never resend history or the full deliverable to the model. */
export function blueprintContext(blueprint: Blueprint | undefined, specialist: SpecialistId = 'syntra'): string {
  if (!blueprint) return 'No Solution Blueprint has been drafted yet.';
  const current = normalizeStoredBlueprint(blueprint);
  const role = normalizeSpecialist(specialist);
  const manual = keys.flatMap(section => current.sections[section].filter(item => item.status === 'manual').map(item => ({ section, item })));
  const focused = focus[role].flatMap(section => current.sections[section].filter(item => item.status !== 'manual').map(item => ({ section, item })));
  const items: Array<{ section: BlueprintSectionKey; id: string; status: BlueprintStatus; title: string; detail: string;
    details?: BlueprintDetail[]; detailTruncated: boolean; reviewRequired: boolean }> = [];
  let characters = 0, omittedManualItems = 0;
  for (const { section, item } of [...manual, ...focused]) {
    const edited = item.status === 'manual';
    const projection = { section, id: item.id, status: item.status, title: item.title,
      detail: edited ? item.detail : item.detail.slice(0, 180), ...(edited && item.details ? { details: item.details } : {}),
      detailTruncated: !edited && item.detail.length > 180, reviewRequired: !!item.reviewRequired };
    const length = JSON.stringify(projection).length;
    if (characters + length > 9000 || (!edited && items.length >= 12)) { if (edited) omittedManualItems++; continue; }
    items.push(projection); characters += length;
  }
  return JSON.stringify({ version: current.version, briefRevision: current.briefRevision, items, omittedManualItems,
    ...(omittedManualItems ? { contextIncomplete: true,
      constraint: 'Some manual constraints exceed this context budget. Do not infer their contents, contradict them or claim the whole Blueprint was reviewed; ask for the relevant constraint before refining affected scope.' } : {}),
    removedItems: current.removedItemIds.filter(id => focus[role].some(section => id.startsWith(`${section}/`))).slice(0, 24) });
}
const markdownText = (value: string) => value.replace(/[\\`*_{}\[\]<>#]/g, character => `\\${character}`);
export function blueprintMarkdown(blueprint: Blueprint): string {
  const current = normalizeStoredBlueprint(blueprint);
  const lines = ['# Solution Blueprint', '', 'Digital Prodigy · Syntra', '',
    `Version ${current.version} · Project brief revision ${current.briefRevision}`, current.updatedAt ? `Updated ${current.updatedAt}` : 'No project details captured yet.', '',
    'A working implementation recommendation for review. Recommendations and assumptions are not confirmed requirements, connected integrations, delivery commitments, studio prices or guaranteed outcomes.', ''];
  for (const section of BLUEPRINT_SECTIONS) {
    lines.push(`## ${section.label}`, '');
    if (!current.sections[section.id].length) lines.push('Not established yet. Discuss this before making a commitment.', '');
    for (const item of current.sections[section.id]) {
      lines.push(`### ${markdownText(item.title)}`, '', `**${item.status === 'manual' ? 'Manually edited' : item.status[0].toUpperCase() + item.status.slice(1)}${item.reviewRequired ? ' · Review required after project changes' : ''}**`, '', markdownText(item.detail), '');
      for (const detail of item.details ?? []) lines.push(`- **${markdownText(detail.label)}:** ${markdownText(detail.value)}`);
      if (item.details?.length) lines.push('');
      if (item.evidence) lines.push(`Evidence / basis: ${markdownText(item.evidence)}`, '');
    }
  }
  lines.push('## Recent version changes', '');
  for (const revision of [...current.history].reverse()) {
    lines.push(`- Version ${revision.version} · ${revision.createdAt} · ${revision.source} · ${revision.changedSections.join(', ') || 'brief revision synchronized'}`);
    for (const change of revision.changes) lines.push(`  - ${markdownText(change.after?.title ?? change.before?.title ?? change.itemId)}: ${change.before ? change.after ? 'updated' : 'removed' : 'added'}`);
  }
  lines.push('', '## Discuss the next step', '', 'Review the current project brief and this Blueprint, then choose what to share at https://digitalprodigy.dev/contact. Opening the form does not send this document, submit an enquiry or book an appointment.', '');
  return lines.join('\n');
}

export const BLUEPRINT_MODEL_GUIDANCE = `Contribute to the shared Solution Blueprint when you have useful new project-specific reasoning. Return optional blueprintChanges with at most FOUR focused upserts per turn; otherwise omit it or return []. Never return the whole Blueprint or its history.
Each upsert: {"section":"architecture","id":"stable_project_item_id","title":"short title","detail":"project-specific reasoning","status":"confirmed|recommendation|assumption","evidence":"exact visitor quote supporting the need, or an explicit assumption statement","details":[{"label":"Data flow","value":"source → validation → destination"}]}.
Sections: ${keys.join(', ')}. Reuse an existing item ID when revising it. IDs use lowercase letters, digits, underscores or hyphens; do not use reserved brief_ or plan_ prefixes. Do not change manual items, resurrect removed items or claim recommendations are installed systems. Do not restate the brief in every section. Confirmed factual detail must be a direct excerpt of the quoted visitor evidence (use a recommendation for inferred or paraphrased conclusions); confirmed headings and rows are normalized to avoid unsupported factual claims; proposed architecture, controls, phases and service choices are recommendations. Assumptions must be labelled and state how to verify them.
Kryon contributes architecture components, data/API boundaries, integrations, risks, alternatives and phased dependencies. Nyx contributes workflows with Trigger, Actions, Exceptions, Human approval and Outcome details. Syntra coordinates objectives, service fit and open decisions. All perspectives share one existing model session and the same customer memory.
A value item requires calculation:{monthlyVolume:{value,status:"confirmed|assumption",evidence},minutesBefore:{value,status,evidence},minutesAfter:{value,status,evidence},hourlyCost?:{value,status,evidence},currency?:"GBP"}. Confirmed quantity evidence must quote the visitor's number and unit (cases/invoices/orders per month for volume; never silently convert a weekly or annual workload to monthly, minutes for effort, per hour for cost); any unsupported estimate is explicitly an assumption. The server derives arithmetic and labels capacity value as illustrative, not ROI or guaranteed savings. Never invent prices or business outcomes. Prefer no value item when there is no useful basis.
Keep title ≤160 characters, detail ≤1200, evidence ≤2000; at most six detail rows, labels ≤60 and values ≤300. Blueprint changes are staged until this same consultation turn commits.`;
