import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_FIELDS, type Brief } from './types.ts';
import { manualBrief, parseAdvisorResult, buildSystemPrompt } from './engine.ts';
import { SPECIALISTS } from './specialists.ts';
import { BLUEPRINT_SECTIONS, BLUEPRINT_LIMITS, BLUEPRINT_BRIEF_FIELDS, emptyBlueprint, evolveBlueprint, manualBlueprint,
  normalizeStoredBlueprint, parseBlueprintContributions, blueprintContext, blueprintMarkdown, type BlueprintContribution, type Blueprint } from './blueprint.ts';

const now = '2026-11-02T10:00:00.000Z';
const statement = 'We review 100 invoices a month, taking 30 minutes each. We use HubSpot and Slack. Our goal is faster approvals.';
const brief = (): Brief => ({ ...EMPTY_FIELDS, revision: 1, objective: 'Faster invoice approvals', requirements: 'Review invoices before sending an approved result',
  integrations: 'HubSpot and Slack', service: 'AI automation systems', provenance: {
    objective: { status: 'confirmed', evidence: 'Our goal is faster approvals.' },
    requirements: { status: 'confirmed', evidence: 'We review 100 invoices a month' },
    integrations: { status: 'confirmed', evidence: 'We use HubSpot and Slack.' },
    service: { status: 'suggested', evidence: 'We review 100 invoices a month' },
  } });
const context = { visitorHistory: [statement], latest: statement, now };
const contribution = (overrides: Partial<BlueprintContribution> = {}): BlueprintContribution => ({
  section: 'architecture', id: 'review_boundary', title: 'A review service owns approval transitions',
  detail: 'Keep invoice state and authorized approval transitions behind one application API; connectors consume only approved outcomes.',
  status: 'recommendation', evidence: 'Our goal is faster approvals.', details: [{ label: 'Boundary', value: 'Draft → reviewed → approved; rejection returns to the owner.' }], ...overrides,
});
const initial = () => evolveBlueprint(undefined, brief(), [], context);

test('Kryon and Nyx rebrand leaves persisted roles and real Azure voice profiles stable', () => {
  assert.deepEqual(SPECIALISTS.map(item => [item.id, item.name, item.title, item.voiceId]), [
    ['syntra', 'Syntra', 'Principal Consultant', 'en-GB-SoniaNeural'],
    ['technical', 'Kryon', 'Technical Architect', 'en-GB-LibbyNeural'],
    ['automation', 'Nyx', 'Automation & Workflow Specialist', 'en-GB-BellaNeural'],
  ]);
  assert.match(SPECIALISTS[1].guidance, /calm, exact/);
  assert.match(SPECIALISTS[2].guidance, /human handoffs, accountability/);
  assert.doesNotMatch(JSON.stringify(SPECIALISTS), /Caelis|Veyra/);
});

test('brief automatically produces a useful bounded ten-section plan without inventing quantified value', () => {
  const blueprint = initial();
  assert.equal(blueprint.version, 1);
  assert.equal(blueprint.briefRevision, 1);
  assert.deepEqual(Object.keys(blueprint.sections), BLUEPRINT_SECTIONS.map(section => section.id));
  assert.equal(blueprint.sections.objectives[0].detail, brief().objective);
  assert.equal(blueprint.sections.value.length, 0);
  assert.ok(blueprint.sections.services.some(item => item.title.includes('Published example: FlowCraft AI')));
  assert.ok(blueprint.sections.services.some(item => item.details?.some(detail => detail.value === 'https://digitalprodigy.dev/')));
  assert.ok(blueprint.sections.workflows[0].details?.some(detail => detail.label === 'Human approval'));
  assert.ok(blueprint.sections.roadmap.some(item => item.details?.some(detail => detail.label === 'Dependency')));
  assert.match(JSON.stringify(blueprint.sections.integrations), /not connected services|Verify vendor API/);
  assert.deepEqual(normalizeStoredBlueprint(blueprint), blueprint);
});

test('empty briefs stay honest and no-op synchronization does not manufacture versions', () => {
  const blank: Brief = { ...EMPTY_FIELDS, revision: 0, provenance: {} };
  assert.deepEqual(evolveBlueprint(undefined, blank), emptyBlueprint());
  const blueprint = initial();
  assert.deepEqual(evolveBlueprint(blueprint, brief(), [], { ...context, source: 'regenerate' }), blueprint);
});

test('Kryon architecture and Nyx workflow contributions accumulate in one shared deliverable', () => {
  const architecture = evolveBlueprint(initial(), brief(), [contribution()], { ...context, specialist: 'technical' });
  const workflow = evolveBlueprint(architecture, brief(), [contribution({ section: 'workflows', id: 'approval_workflow', title: 'Invoice review with an accountable approver',
    detail: 'Stage a proposed result, require an approver and reconcile uncertain connector outcomes.',
    details: [{ label: 'Trigger', value: 'A new invoice is ready for review' }, { label: 'Exceptions', value: 'Missing account or duplicate event goes to the reviewer' }],
  })], { ...context, specialist: 'automation' });
  assert.equal(workflow.sections.architecture.find(item => item.id === 'review_boundary')?.specialist, 'technical');
  assert.equal(workflow.sections.workflows.find(item => item.id === 'approval_workflow')?.specialist, 'automation');
  assert.equal(workflow.sections.objectives[0].detail, brief().objective);
  assert.equal(workflow.version, 3);
  assert.equal(workflow.history.at(-1)?.specialist, 'automation');
});

test('confirmed Blueprint facts require visitor evidence and assumptions are explicitly labelled', () => {
  const blueprint = evolveBlueprint(initial(), brief(), [
    contribution({ id: 'fabricated', status: 'confirmed', evidence: 'The enterprise account has unlimited API access.' }),
    contribution({ id: 'real_fact', section: 'integrations', status: 'confirmed', title: 'Existing systems', detail: 'HubSpot and Slack', evidence: 'We use HubSpot and Slack.' }),
    contribution({ id: 'to_verify', section: 'integrations', status: 'assumption', title: 'Sandbox access needs verification', detail: 'Assume a test account can be made available; verify this with the system owner.', evidence: 'Planning assumption; vendor account access remains unverified.' }),
  ], context);
  assert.equal(blueprint.sections.architecture.some(item => item.id === 'fabricated'), false);
  assert.equal(blueprint.sections.integrations.find(item => item.id === 'real_fact')?.status, 'confirmed');
  assert.equal(blueprint.sections.integrations.find(item => item.id === 'to_verify')?.status, 'assumption');
});

test('manual plan corrections survive specialist changes and require review after changed project facts', () => {
  const generated = evolveBlueprint(initial(), brief(), [contribution()], { ...context, specialist: 'technical' });
  const edited = manualBlueprint(generated, { section: 'architecture', itemId: 'review_boundary', detail: 'Use the existing approval service; do not create a second one.' }, generated.version);
  const corrected = manualBrief(brief(), { objective: 'Reduce disputed approvals', integrations: 'Existing ERP only' }, brief().revision);
  const evolved = evolveBlueprint(edited, corrected, [contribution({ detail: 'Build a second approval service.' })], { ...context, specialist: 'automation' });
  const item = evolved.sections.architecture.find(item => item.id === 'review_boundary')!;
  assert.equal(item.detail, 'Use the existing approval service; do not create a second one.');
  assert.equal(item.status, 'manual');
  assert.equal(item.reviewRequired, true);
  assert.equal(evolved.sections.objectives.find(item => item.id === 'brief_objective')?.detail, 'Reduce disputed approvals');
  assert.equal(evolved.sections.integrations.find(item => item.id === 'brief_integrations')?.detail, 'Existing ERP only');
  assert.equal(evolved.sections.objectives.find(item => item.id === 'brief_objective')?.status, 'manual');
  assert.deepEqual(edited.sections.objectives, generated.sections.objectives, 'Domain operations do not mutate their input');
});

test('canonical brief facts have one correction path and cleared facts disappear on synchronization', () => {
  const current = initial();
  assert.equal(BLUEPRINT_BRIEF_FIELDS.brief_objective, 'objective');
  assert.throws(() => manualBlueprint(current, { section: 'objectives', itemId: 'brief_objective', detail: 'Contradict the canonical brief' }, current.version), /project brief/);
  assert.throws(() => manualBlueprint(current, { section: 'objectives', itemId: 'brief_objective', remove: true }, current.version), /project brief/);
  const cleared = manualBrief(brief(), { integrations: null }, 1);
  const synced = evolveBlueprint(current, cleared, [], context);
  assert.equal(synced.sections.integrations.some(item => item.id === 'brief_integrations'), false);
  assert.equal(synced.sections.integrations.some(item => item.id === 'plan_access_check'), false);
});

test('intentional recommendation removals do not resurrect during regeneration or another model turn', () => {
  let current = evolveBlueprint(initial(), brief(), [contribution()], context);
  current = manualBlueprint(current, { section: 'architecture', itemId: 'review_boundary', remove: true }, current.version);
  current = manualBlueprint(current, { section: 'workflows', itemId: 'plan_pilot', remove: true }, current.version);
  const synced = evolveBlueprint(current, brief(), [contribution()], { ...context, source: 'regenerate' });
  assert.equal(synced.sections.architecture.some(item => item.id === 'review_boundary'), false);
  assert.equal(synced.sections.workflows.some(item => item.id === 'plan_pilot'), false);
  assert.ok(synced.removedItemIds.includes('architecture/review_boundary'));
});

test('version history records bounded concrete before-and-after changes and rejects stale edits', () => {
  let current = initial();
  for (let turn = 0; turn < 9; turn++) current = manualBlueprint(current, {
    section: 'architecture', itemId: 'plan_boundaries', detail: `Owner-approved architecture revision ${turn}`,
  }, current.version);
  assert.equal(current.history.length, BLUEPRINT_LIMITS.history);
  const change = current.history.at(-1)!.changes.find(change => change.itemId === 'plan_boundaries')!;
  assert.equal(change.before?.detail, 'Owner-approved architecture revision 7');
  assert.equal(change.after?.detail, 'Owner-approved architecture revision 8');
  assert.equal(change.after?.status, 'manual');
  assert.throws(() => manualBlueprint(current, { section: 'architecture', itemId: 'plan_boundaries', detail: 'Stale change' }, 1), /Blueprint changed/);
  assert.deepEqual(manualBlueprint(current, { section: 'architecture', itemId: 'plan_boundaries', detail: 'Owner-approved architecture revision 8' }, current.version), current);
});

test('model delta parser bounds output and rejects reserved IDs, manual provenance and invalid structured notes', () => {
  assert.equal(parseBlueprintContributions(Array.from({ length: 8 }, (_, index) => contribution({ id: `component_${index}` }))).length, 4);
  for (const patch of [contribution({ id: 'brief_objective' }), contribution({ id: 'plan_pilot' }), { ...contribution(), status: 'manual' },
    { ...contribution(), details: [{ label: 'x', value: 'y'.repeat(301) }] }, { ...contribution(), detail: 'x'.repeat(1201) }]) {
    assert.deepEqual(parseBlueprintContributions([patch]), []);
  }
  const output = parseAdvisorResult(JSON.stringify({ reply: 'A review boundary is appropriate.', changes: {}, blueprintChanges: [contribution()] }), false);
  assert.equal(output.blueprintChanges?.length, 1);
});

const calculation = () => ({
  monthlyVolume: { value: 100, status: 'confirmed' as const, evidence: '100 invoices a month' },
  minutesBefore: { value: 30, status: 'confirmed' as const, evidence: '30 minutes' },
  minutesAfter: { value: 10, status: 'assumption' as const, evidence: 'Assume a 10-minute review target; verify in the pilot.' },
  hourlyCost: { value: 50, status: 'assumption' as const, evidence: 'Assume GBP 50 per hour for a capacity scenario, not a price.' }, currency: 'GBP',
});
test('business-value arithmetic is computed from supported or explicitly assumed quantities', () => {
  const current = evolveBlueprint(initial(), brief(), [contribution({ section: 'value', id: 'capacity_case', status: 'assumption',
    title: 'Guaranteed profit', detail: 'The model must not control the derived arithmetic or promise.', calculation: calculation(),
  })], { ...context, specialist: 'automation' });
  const scenario = current.sections.value[0];
  assert.equal(scenario.title, 'Illustrative monthly capacity');
  assert.equal(scenario.status, 'assumption');
  assert.match(scenario.details!.find(detail => detail.label === 'Potential capacity')!.value, /33\.33 hours/);
  assert.match(scenario.details!.find(detail => detail.label === 'Capacity valuation')!.value, /1,666\.67 GBP/);
  assert.match(scenario.detail, /not a guaranteed outcome/);
  assert.ok(scenario.details!.some(detail => detail.value.includes('assumption')));
  assert.throws(() => manualBlueprint(current, { section: 'value', itemId: 'capacity_case', details: [{ label: 'Profit', value: 'Guaranteed' }] }, current.version), /source quantities/);
});

test('fabricated numeric evidence and unstructured ROI claims cannot enter value scenarios', () => {
  const invented = calculation();
  invented.monthlyVolume.value = 100000;
  let current = evolveBlueprint(initial(), brief(), [contribution({ section: 'value', id: 'invented', calculation: invented })], context);
  assert.equal(current.sections.value.length, 0);
  current = evolveBlueprint(current, brief(), [contribution({ section: 'value', id: 'roi_claim', title: 'Guaranteed ROI', detail: 'Guaranteed profit with no source numbers.' })], context);
  assert.equal(current.sections.value.length, 0);
});

test('specialist model context is compact and omits history and irrelevant sections', () => {
  const current = initial();
  const data = JSON.parse(blueprintContext(current, 'technical'));
  assert.ok(data.items.length <= 12);
  assert.equal(data.history, undefined);
  assert.equal(data.items.some((item: { section: string }) => item.section === 'workflows'), false);
  assert.ok(data.items.every((item: { detail: string }) => item.detail.length <= 180));
  assert.match(buildSystemPrompt('AI automation', 'technical'), /Kryon/);
  assert.match(buildSystemPrompt('AI automation', 'automation'), /Nyx/);
});

test('Markdown deliverable includes provenance, decisions, source evidence and honest conversion limits', () => {
  const current = manualBlueprint(initial(), { section: 'architecture', itemId: 'plan_boundaries', title: '<script>unsafe()</script>', detail: 'Review [external](javascript:bad) before release.' }, 1);
  const exported = blueprintMarkdown(current);
  for (const section of BLUEPRINT_SECTIONS) assert.ok(exported.includes(`## ${section.label}`));
  assert.match(exported, /Manually edited/);
  assert.match(exported, /Evidence \/ basis/);
  assert.match(exported, /https:\/\/digitalprodigy.dev\/contact/);
  assert.match(exported, /does not send this document/);
  assert.equal(exported.includes('<script>'), false);
});

test('malformed persisted Blueprint data fails closed instead of losing manual content', () => {
  const original = initial();
  const broken: unknown[] = [ { ...original, sections: [] }, { ...original, history: [{}] }, { ...original, removedItemIds: ['bad'] },
    { ...original, sections: { ...original.sections, architecture: [original.sections.architecture[0], original.sections.architecture[0]] } },
    { ...original, unknownData: 'x'.repeat(300000) } ];
  for (const value of broken) assert.throws(() => normalizeStoredBlueprint(value), /could not be read safely/);
  assert.equal(original.version, 1);
});

test('a full section never drops manually edited work to insert a new canonical fact', () => {
  let current = initial();
  for (let index = 0; index < 8; index++) {
    const patch = contribution({ section: 'roadmap', id: `manual_phase_${index}`, title: `Manual phase ${index}` });
    current = evolveBlueprint(current, brief(), [patch], context);
    const item = current.sections.roadmap.find(item => item.id === patch.id);
    if (item) current = manualBlueprint(current, { section: 'roadmap', itemId: item.id, detail: `Keep phase ${index}` }, current.version);
  }
  const manualIds = current.sections.roadmap.filter(item => item.source === 'manual').map(item => item.id);
  const changed = manualBrief(brief(), { budget: '£9000', timeline: 'To be agreed' }, 1);
  const synced = evolveBlueprint(current, changed, [], context);
  assert.ok(manualIds.every(id => synced.sections.roadmap.some(item => item.id === id && item.status === 'manual')));
  assert.ok(synced.sections.roadmap.length <= BLUEPRINT_LIMITS.itemsPerSection);
});


test('legacy unprovenanced facts stay assumptions requiring review and suggestions are never called agreed', () => {
  const legacy = { ...brief(), provenance: {}, nextStep: 'Book a call' };
  const current = evolveBlueprint(undefined, legacy, [], context);
  assert.equal(current.sections.objectives[0].status, 'assumption');
  assert.equal(current.sections.objectives[0].reviewRequired, true);
  const suggested = { ...legacy, provenance: { service: { status: 'suggested' as const, evidence: statement }, nextStep: { status: 'suggested' as const, evidence: statement } } };
  const plan = evolveBlueprint(undefined, suggested, [], context);
  assert.equal(plan.sections.services[0].title, 'Proposed project direction');
  assert.equal(plan.sections.decisions[0].title, 'Proposed next step');
});

test('value inputs cannot reinterpret a quoted duration as case volume or an invoice count as hourly cost', () => {
  const invalid = calculation();
  invalid.monthlyVolume = { value: 30, status: 'confirmed', evidence: '30 minutes' };
  const current = evolveBlueprint(initial(), brief(), [contribution({ section: 'value', id: 'wrong_units', calculation: invalid })], context);
  assert.equal(current.sections.value.length, 0);
  const noHour = calculation();
  noHour.hourlyCost = { value: 100, status: 'confirmed', evidence: '100 invoices a month' };
  assert.equal(evolveBlueprint(initial(), brief(), [contribution({ section: 'value', id: 'wrong_cost', calculation: noHour })], context).sections.value.length, 0);
});


test('monthly volume must quote a monthly period and each number must correspond to its own unit', () => {
  const weekly = calculation();
  weekly.monthlyVolume = { value: 500, status: 'confirmed', evidence: '500 cases per week' };
  const visitor = 'We handle 500 cases per week, taking 30 minutes per case.';
  assert.equal(evolveBlueprint(initial(), brief(), [contribution({ section: 'value', id: 'weekly', status: 'assumption', calculation: weekly })], {
    ...context, visitorHistory: [statement, visitor], latest: visitor,
  }).sections.value.length, 0);
  const wrongNumber = calculation();
  wrongNumber.minutesBefore = { value: 100, status: 'confirmed', evidence: '100 invoices a month, taking 30 minutes' };
  assert.equal(evolveBlueprint(initial(), brief(), [contribution({ section: 'value', id: 'wrong_quantity', status: 'assumption', calculation: wrongNumber })], context).sections.value.length, 0);
});

test('confirmed hourly currency remains visible when both rate and currency are actually quoted', () => {
  const source = 'We handle 100 invoices a month, currently taking 30 minutes each. Our hourly cost is GBP 50 per hour.';
  const scenario = calculation();
  scenario.hourlyCost = { value: 50, status: 'confirmed', evidence: 'GBP 50 per hour' };
  const current = evolveBlueprint(initial(), brief(), [contribution({ section: 'value', id: 'currency_case', status: 'assumption', calculation: scenario })], {
    ...context, visitorHistory: [source], latest: source,
  });
  assert.match(current.sections.value[0].details!.find(item => item.label === 'Capacity valuation')!.value, /GBP/);
});

test('a valid but unrelated visitor quote cannot confirm invented architecture', () => {
  const current = evolveBlueprint(initial(), brief(), [contribution({ id: 'fake_installed_system', status: 'confirmed',
    title: 'Enterprise platform installed', detail: 'An enterprise platform already handles every approval with unlimited API access.', evidence: 'Our goal is faster approvals.',
  })], context);
  assert.equal(current.sections.architecture.some(item => item.id === 'fake_installed_system'), false);
});

test('manual constraints outside the selected specialist focus take precedence and retain full text', () => {
  const details = 'A manually edited buyer constraint. '.repeat(30);
  let current = initial();
  current = manualBlueprint(current, { section: 'workflows', itemId: 'plan_pilot', detail: details }, current.version);
  const data = JSON.parse(blueprintContext(current, 'technical'));
  assert.equal(data.items[0].section, 'workflows');
  assert.equal(data.items[0].detail, details.trim());
  assert.equal(data.items[0].detailTruncated, false);
  assert.ok(JSON.stringify(data).length < 12000);
});


test('structured-note edits retain meaningful before-and-after history instead of identical prose', () => {
  const first = initial();
  const current = manualBlueprint(first, { section: 'workflows', itemId: 'plan_pilot', details: [
    { label: 'Trigger', value: 'Only the named operations owner may start a review.' },
  ] }, first.version);
  const change = current.history.at(-1)!.changes.find(change => change.itemId === 'plan_pilot')!;
  assert.match(change.after!.detail, /Only the named operations owner/);
  assert.notEqual(change.before!.detail, change.after!.detail);
});

test('overflowing manual model context reports omitted constraints explicitly and remains bounded', () => {
  const current = initial();
  for (const section of BLUEPRINT_SECTIONS) for (const item of current.sections[section.id]) {
    if (Object.hasOwn(BLUEPRINT_BRIEF_FIELDS, item.id)) continue;
    item.status = 'manual'; item.source = 'manual'; item.detail = 'Do not replace this customer correction. '.repeat(28);
  }
  const data = JSON.parse(blueprintContext(current, 'syntra'));
  assert.equal(data.contextIncomplete, true);
  assert.ok(data.omittedManualItems > 0);
  assert.match(data.constraint, /Do not infer their contents/);
  assert.ok(JSON.stringify(data).length < 12000);
  assert.ok(data.items.every((item: { detailTruncated: boolean }) => !item.detailTruncated));
});


test('escaped text and accumulated history cannot persist a Blueprint larger than its reader accepts', () => {
  const current: Blueprint = { ...emptyBlueprint(), version: 4, briefRevision: 1, updatedAt: now, history: [] };
  for (const section of BLUEPRINT_SECTIONS) current.sections[section.id] = Array.from({ length: 8 }, (_, index) => ({
    id: `edited_${index}`, title: 'Customer-owned planning constraint', detail: '"'.repeat(100),
    status: 'manual', evidence: 'Edited in the Solution Blueprint', specialist: 'syntra', source: 'manual',
  }));
  current.history = Array.from({ length: 4 }, (_, index) => ({
    version: index + 1, createdAt: now, source: 'manual', specialist: 'syntra', changedSections: ['architecture'],
    changes: Array.from({ length: 24 }, (_, item) => ({ section: 'architecture', itemId: `historical_${item}`,
      before: { title: '"'.repeat(160), detail: '"'.repeat(240), status: 'manual' },
      after: { title: '"'.repeat(159) + 'x', detail: '"'.repeat(239) + 'x', status: 'manual' },
    })),
  }));
  // Fill below the reader's serialized bound while retaining valid individual
  // fields and fewer than 60,000 visible characters. Escaped quotes take two
  // serialized characters, so this exercises more than a simple text count.
  for (const section of BLUEPRINT_SECTIONS) for (const item of current.sections[section.id]) {
    const remaining = BLUEPRINT_LIMITS.serializedCharacters - 100 - JSON.stringify(current).length;
    const extra = Math.max(0, Math.min(1200 - item.detail.length, Math.floor(remaining / 2)));
    item.detail += '"'.repeat(extra);
  }
  const before = JSON.stringify(current);
  assert.ok(before.length > BLUEPRINT_LIMITS.serializedCharacters - 200);
  assert.deepEqual(normalizeStoredBlueprint(current), current, 'The previous version is a valid, readable document');
  assert.throws(() => manualBlueprint(current, {
    section: 'architecture', itemId: 'edited_0', details: Array.from({ length: 6 }, (_, index) => ({
      label: `Customer note ${index}`, value: '"'.repeat(300),
    })),
  }, current.version), { status: 422 });
  assert.equal(JSON.stringify(current), before, 'Reject the oversized edit atomically without truncating customer content or history');
  assert.deepEqual(normalizeStoredBlueprint(current), current);
});
