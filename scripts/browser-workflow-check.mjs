/** Real-browser UI regressions with an explicitly synthetic, tab-local runtime.
 * No model, speech provider, database or external enquiry is contacted. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const source = process.env.SYNTRA_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(source.startsWith('/') ? pathToFileURL(source).href : source);
const base = process.env.SYNTRA_CHECK_URL || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Synthetic runtime checks require a local preview; never inject them into production.');
}
const out = resolve('generated-artifacts/browser-workflows');
await mkdir(out, { recursive: true });
// Exercise the actual portable Blueprint transformations, not a second test implementation.
// Only the transport/model and tab persistence are synthetic in these browser checks.
const { build } = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url))('esbuild');
const domainBundle = await build({ stdin: { contents: `
  export { emptyBlueprint, evolveBlueprint } from './lib/consultation/src/blueprint.ts';
  export { readBlueprintStore, mutateBlueprintStore } from './lib/consultation/src/blueprint-storage.ts';
`, resolveDir: resolve('.'), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser',
  globalName: 'SyntraBlueprintTestDomain', logLevel: 'silent' });
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox'],
});
const results = [];
const browserEvidence = [];
const fixture = (domain) => {
  const key = 'syntra.synthetic.browser-fixture.v1';
  const fields = { objective: 'A production studio approval portal.', service: 'Client portals & dashboards',
    proposedSolution: 'A small role-based approval workflow.', requirements: 'Version reviews and an audit trail.',
    integrations: 'Existing project management API, subject to validation.', budget: 'Budget awaiting discussion.',
    timeline: 'Pilot after scope review.', nextStep: 'Review the brief and use the approved enquiry form.' };
  let saved = JSON.parse(localStorage.getItem(key) || 'null');
  if (!saved) {
    const brief = { ...fields, revision: 1, provenance: Object.fromEntries(Object.keys(fields).map((field, i) =>
      [field, { status: i === 0 ? 'confirmed' : 'suggested', evidence: '' }])) };
    saved = { conversation: { id: 1, title: 'Synthetic browser consultation', depth: 'detailed',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [], brief },
      receipts: {}, sends: [], enquiries: [], failNextMessage: false, failNextEnquiry: false, voiceConnections: 0, blueprintCalls: [], failNextBlueprint: false };
  }
  const save = () => localStorage.setItem(key, JSON.stringify(saved));
  const copy = value => structuredClone(value);
  saved.blueprintCalls ??= [];
  saved.blueprintStore ??= { document: domain.emptyBlueprint(), receipts: [] };
  saved.conversation.blueprint = copy(saved.blueprintStore.document);
  const evolve = (contributions = [], specialist = 'syntra', latest = '', source = 'specialist') => {
    saved.blueprintStore.document = domain.evolveBlueprint(saved.blueprintStore.document, saved.conversation.brief, contributions, {
      visitorHistory: saved.conversation.messages.filter(message => message.role === 'visitor').map(message => message.content),
      latest, specialist, source,
    });
    saved.conversation.blueprint = copy(saved.blueprintStore.document);
  };
  localStorage.setItem('dp.activeConversation', '1');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {
    throw new DOMException('Synthetic clipboard denial', 'NotAllowedError');
  } } });
  window.__SYNTRA_TEST__ = {
    snapshot: () => copy(saved),
    loseNextMessage: () => { saved.failNextMessage = true; save(); },
    loseNextEnquiry: () => { saved.failNextEnquiry = true; save(); },
    loseNextBlueprint: () => { saved.failNextBlueprint = true; save(); },
    rejectNextBlueprint: () => { saved.rejectNextBlueprint = true; save(); },
    bumpBrief: () => { saved.conversation.brief.revision++; saved.conversation.brief.timeline = 'Updated after review.'; evolve([], 'syntra', '', 'brief'); save();
      window.__SYNTRA_TEST__.emit?.({ type: 'conversation-updated' }); },
  };
  window.__SYNTRA_RUNTIME__ = {
    sessions: { list: async () => [{ ...copy(saved.conversation), messageCount: saved.conversation.messages.length }],
      create: async () => copy(saved.conversation), get: async () => copy(saved.conversation) },
    messages: { send: async (_id, input) => {
      saved.sends.push(copy(input));
      if (saved.receipts[input.requestId]) { save(); return { ...copy(saved.receipts[input.requestId]), brief: copy(saved.conversation.brief), blueprint: copy(saved.conversation.blueprint) }; }
      const next = saved.conversation.messages.length + 1;
      const visitorMessage = { id: next, role: 'visitor', content: input.content, depth: input.depth, createdAt: new Date().toISOString() };
      const specialist = input.specialist || 'syntra';
      const syntheticReplies = {
        syntra: 'Synthetic consultation: a narrow approval workflow could reduce email chasing. Who owns the final approval?',
        technical: 'Synthetic architecture: separate the approval UI, permission checks, review records and integration worker. Verify API access before choosing the connection. Which system holds your project records?',
        automation: 'Synthetic automation: route a submitted version to its reviewer, request human approval, and put failed deliveries in a retry queue. Which exceptions need the coordinator to intervene?',
      };
      const message = { id: next + 1, role: 'advisor', content: syntheticReplies[specialist], depth: input.depth, createdAt: new Date().toISOString() };
      saved.conversation.messages.push(visitorMessage, message);
      saved.conversation.depth = input.depth;
      const contributions = specialist === 'technical' ? [{ section: 'architecture', id: 'reviewer-boundary',
        title: 'Reviewer permission boundary', detail: 'Keep project records, review decisions and integration jobs separate; validate access on every approval.',
        status: 'recommendation', evidence: input.content, details: [{ label: 'Components', value: 'Approval UI → permission check → review record → integration job' },
          { label: 'Dependency', value: 'Project-system API and permitted scopes require verification.' }] }]
        : specialist === 'automation' ? [{ section: 'workflows', id: 'review-routing', title: 'Human approval routing',
          detail: 'Route a submitted version to its named reviewer; never infer a client approval from silence.', status: 'recommendation', evidence: input.content,
          details: [{ label: 'Trigger', value: 'A version is submitted for review.' }, { label: 'Action', value: 'Notify the assigned reviewer and record the request.' },
            { label: 'Approval', value: 'A human reviewer approves or requests changes.' }, { label: 'Exception', value: 'Retries enter a visible queue owned by the coordinator.' },
            { label: 'Outcome', value: 'Measure turnaround against the supplied baseline.' }] }] : [];
      const quantities = saved.conversation.messages.find(message => message.role === 'visitor' && /100 cases per month/.test(message.content));
      if (specialist === 'automation' && quantities) contributions.push({ section: 'value', id: 'approval-capacity',
        title: 'Illustrative approval capacity', detail: 'A pilot scenario, not a guarantee.', status: 'assumption',
        evidence: 'Assume 10 minutes per approval after the pilot; verify with the team.',
        calculation: { monthlyVolume: { value: 100, status: 'confirmed', evidence: quantities.content },
          minutesBefore: { value: 30, status: 'confirmed', evidence: quantities.content },
          minutesAfter: { value: 10, status: 'assumption', evidence: 'Assume 10 minutes per approval; measure the pilot.' } } });
      evolve(contributions, specialist, input.content);
      const reply = { visitorMessage, message, brief: copy(saved.conversation.brief), blueprint: copy(saved.conversation.blueprint), specialist, suggestedNextSteps: [] };
      saved.receipts[input.requestId] = reply;
      const fail = saved.failNextMessage; saved.failNextMessage = false; save();
      if (fail) throw new Error('Synthetic lost acknowledgement');
      return copy(reply);
    } },
    briefs: { get: async () => copy(saved.conversation.brief), update: async (_id, changes, revision) => {
      if (revision !== saved.conversation.brief.revision) throw new Error('Synthetic revision conflict');
      for (const [field, value] of Object.entries(changes)) {
        saved.conversation.brief[field] = value;
        saved.conversation.brief.provenance[field] = { status: 'manual', evidence: '' };
      }
      saved.conversation.brief.revision++; evolve([], 'syntra', '', 'brief'); save(); return copy(saved.conversation.brief);
    } },
    blueprints: {
      get: async () => copy(saved.blueprintStore.document),
      regenerate: async (_id, input) => {
        saved.blueprintCalls.push({ kind: 'regenerate', input: copy(input) });
        saved.blueprintStore = await domain.mutateBlueprintStore(saved.blueprintStore, input, 'regenerate', saved.conversation.brief);
        saved.conversation.blueprint = copy(saved.blueprintStore.document);
        const fail = saved.failNextBlueprint; saved.failNextBlueprint = false; save();
        if (fail) throw new Error('Synthetic lost Blueprint acknowledgement');
        return copy(saved.conversation.blueprint);
      },
      update: async (_id, input) => {
        saved.blueprintCalls.push({ kind: 'update', input: copy(input) });
        if (saved.rejectNextBlueprint) {
          saved.rejectNextBlueprint = false; save();
          throw Object.assign(new Error('Synthetic full-document limit: the previous version is preserved. Shorten the correction and try again.'), { code: 'BLUEPRINT_CHANGE_REJECTED' });
        }
        saved.blueprintStore = await domain.mutateBlueprintStore(saved.blueprintStore, input, 'update', saved.conversation.brief);
        saved.conversation.blueprint = copy(saved.blueprintStore.document);
        const fail = saved.failNextBlueprint; saved.failNextBlueprint = false; save();
        if (fail) throw new Error('Synthetic lost Blueprint acknowledgement');
        return copy(saved.conversation.blueprint);
      },
    },
    services: async () => [],
    booking: { contacts: async () => [{ id: 'enquiry', kind: 'link', label: 'Approved enquiry form',
      detail: 'External form; nothing is sent automatically.', href: 'https://digitalprodigy.dev/contact' }],
      submitEnquiry: async input => {
        saved.enquiries.push(copy(input));
        const fail = saved.failNextEnquiry; saved.failNextEnquiry = false; save();
        if (fail) throw new Error('Synthetic lost enquiry acknowledgement');
        return { status: 'confirmed', reference: 'SYNTHETIC-TEST-ONLY' };
      } },
    voice: { available: true, specialists: ['syntra', 'technical', 'automation'], connect: async (_id, emit, _signal, options) => {
      saved.voiceConnections++; save(); window.__SYNTRA_TEST__.emit = emit;
      emit({ type: 'specialist', specialist: options?.specialist || 'syntra' });
      emit({ type: 'state', state: 'listening' });
      return { close: () => emit({ type: 'state', state: 'closed' }), interrupt() {}, setMuted() {}, canSwitchSpecialist: () => true,
        setSpecialist: specialist => emit({ type: 'specialist', specialist }) };
    } },
  };
};
async function context(width = 390, height = 844, device = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, ...device });
  const page = await ctx.newPage();
  await page.addInitScript({ content: domainBundle.outputFiles[0].text + '\n;(' + fixture.toString() + ')(SyntraBlueprintTestDomain);' });
  const errors = [];
  browserEvidence.push({ width, height, touchEmulation: Boolean(device.hasTouch), errors });
  page.on('pageerror', error => errors.push(error.message));
  // Keep every fixture action local, including accidental external navigation.
  await ctx.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin
    || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto(base, { waitUntil: 'networkidle' });
  const initialized = await page.evaluate(() => Boolean(window.__SYNTRA_TEST__ && window.__SYNTRA_RUNTIME__));
  if (!initialized || errors.length) {
    await writeFile(`${out}/initialization-errors.json`, JSON.stringify({ initialized, errors }, null, 2));
    assert.fail(`Synthetic runtime initialization failed: ${JSON.stringify(errors)}`);
  }
  return { ctx, page, errors };
}
async function until(check, message, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.fail(message);
}
async function navigate(page, path) {
  await page.locator(`a[href="${path}"]`).filter({ visible: true }).first().click();
}
try {
  const { ctx, page, errors } = await context();
  await page.getByTestId('button-depth-deep_dive').click();
  await page.evaluate(() => window.__SYNTRA_TEST__.loseNextMessage());
  await page.getByTestId('input-message').fill('Synthetic project request for safe retry.');
  await page.getByTestId('button-send').click();
  await page.getByTestId('status-error').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('button-retry').waitFor();
  assert.equal(await page.getByTestId('message-1').count(), 1, 'Reload shows one committed visitor row');
  await page.getByTestId('button-speak-mobile').click();
  await page.getByText('Recover the pending text message in Discover before starting voice. Its original request is preserved.').waitFor();
  assert.equal((await page.evaluate(() => window.__SYNTRA_TEST__.snapshot())).voiceConnections, 0,
    'An uncertain text request must be recovered before another voice admission');
  await page.getByTestId('button-close-voice').click();
  await page.getByTestId('button-retry').click();
  await until(async () => (await page.evaluate(() => window.__SYNTRA_TEST__.snapshot())).sends.length === 2, 'Retry reaches original request');
  await until(async () => await page.getByTestId('status-error').count() === 0, 'Original request recovers');
  const recovered = await page.evaluate(() => window.__SYNTRA_TEST__.snapshot());
  assert.equal(recovered.conversation.messages.length, 2);
  assert.equal(recovered.sends[0].requestId, recovered.sends[1].requestId);
  assert.equal(recovered.sends[1].depth, 'deep_dive');
  results.push({ scenario: 'lost text acknowledgement, reload, original-ID recovery', passed: true, transportCalls: 2, persistedPairs: 1 });

  await navigate(page, '/brief');
  await page.getByTestId('button-edit-budget').click();
  await page.getByTestId('input-budget').fill('Synthetic manual budget correction.');
  await page.getByTestId('button-save-budget').click();
  await until(async () => await page.getByTestId('status-budget').textContent() === 'Edited', 'Manual provenance visible');
  await page.getByTestId('button-copy-brief').click();
  const markdown = await page.getByTestId('textarea-manual-copy-brief').inputValue();
  const labels = ['Business objective', 'Service direction', 'Proposed solution', 'Requirements', 'Integrations & dependencies', 'Budget', 'Timeline', 'Recommended next step'];
  for (const label of labels) assert.ok(markdown.includes(`### ${label}`), label);
  assert.ok(markdown.includes('Edited by visitor'));
  assert.ok(markdown.includes('Confirmed'));
  assert.ok(markdown.includes('Suggested'));
  const downloadReady = page.waitForEvent('download');
  await page.getByTestId('button-export-brief').click();
  const download = await downloadReady;
  const exported = await readFile(await download.path(), 'utf8');
  assert.equal(exported, markdown);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('status-budget').waitFor();
  assert.equal(await page.getByTestId('status-budget').textContent(), 'Edited');
  results.push({ scenario: 'manual brief persists; denied clipboard and Markdown export preserve all eight fields/provenance', passed: true });

  await page.getByTestId('link-brief-handoff').click();
  const submit = page.getByTestId('button-submit-enquiry');
  await submit.waitFor();
  assert.equal(await submit.isDisabled(), true);
  const contact = page.getByTestId('link-approved-contact-enquiry');
  assert.equal(await contact.getAttribute('href'), 'https://digitalprodigy.dev/contact');
  assert.equal(await contact.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await contact.getAttribute('target'), '_blank');
  await page.getByTestId('input-handoff-name').fill('Synthetic QA');
  await page.getByTestId('input-handoff-email').fill('invalid');
  await page.getByTestId('checkbox-handoff-consent').check();
  await submit.click();
  await page.getByTestId('status-handoff-error').waitFor();
  assert.equal((await page.evaluate(() => window.__SYNTRA_TEST__.snapshot())).enquiries.length, 0);
  await page.getByTestId('input-handoff-email').fill('synthetic@example.invalid');
  await page.evaluate(() => window.dispatchEvent(new Event('dp:open-voice')));
  await page.getByTestId('button-close-voice').waitFor();
  await until(async () => (await page.evaluate(() => window.__SYNTRA_TEST__.snapshot())).voiceConnections === 1, 'Synthetic voice connection established');
  await page.evaluate(() => window.__SYNTRA_TEST__.bumpBrief());
  await page.getByTestId('button-close-voice').click();
  await until(async () => !await page.getByTestId('checkbox-handoff-consent').isChecked(), 'Brief changed: consent must reset');
  assert.equal(await submit.isDisabled(), true);
  await page.getByTestId('checkbox-handoff-consent').check();
  await page.evaluate(() => window.__SYNTRA_TEST__.loseNextEnquiry());
  await submit.click();
  await page.getByTestId('status-handoff-error').waitFor();
  await until(async () => (await page.evaluate(() => window.__SYNTRA_TEST__.snapshot())).enquiries.length === 1, 'One uncertain enquiry');
  const original = (await page.evaluate(() => window.__SYNTRA_TEST__.snapshot())).enquiries[0];
  await page.evaluate(() => window.__SYNTRA_TEST__.bumpBrief());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('button-submit-enquiry').waitFor();
  assert.equal(await page.getByTestId('input-handoff-name').isDisabled(), true);
  await page.getByTestId('button-submit-enquiry').click();
  await page.getByTestId('status-handoff-confirmed').waitFor();
  const final = await page.evaluate(() => window.__SYNTRA_TEST__.snapshot());
  assert.equal(final.enquiries.length, 2);
  assert.deepEqual(final.enquiries[1], original);
  assert.ok(final.conversation.brief.revision > original.briefRevision);
  await page.screenshot({ path: `${out}/handoff-390.png` });
  results.push({ scenario: 'consent binds reviewed revision; malformed details blocked; reload retry preserves reviewed enquiry identity/snapshot', passed: true });
  assert.deepEqual(errors, []);
  const isolated = await context(1440, 900);
  assert.equal((await isolated.page.evaluate(() => window.__SYNTRA_TEST__.snapshot())).conversation.messages.length, 0);
  assert.equal(await isolated.page.getByTestId('message-1').count(), 0);
  assert.deepEqual(isolated.errors, []);
  results.push({ scenario: 'independent browser session cannot see prior fixture transcript or manual correction', passed: true });
  await isolated.ctx.close(); await ctx.close();

  const journey = await context();
  const jp = journey.page;
  const snapshot = () => jp.evaluate(() => window.__SYNTRA_TEST__.snapshot());
  const bottleneck = 'We run 100 cases per month, each taking 30 minutes of email approval chasing. We need a portal with named human reviewers; our project-system API access still needs verification.';
  await jp.getByTestId('button-depth-deep_dive').click();
  await jp.getByTestId('input-message').fill(bottleneck);
  await jp.getByTestId('button-send').click();
  await jp.getByTestId('button-explore-technical').click();
  await jp.getByTestId('button-explore-automation').click();
  await jp.getByTestId('link-review-blueprint').waitFor();
  const shared = await snapshot();
  assert.equal(shared.conversation.id, 1);
  assert.equal(shared.conversation.messages.length, 6, 'All three perspectives persist in one consultation');
  assert.deepEqual(shared.sends.map(send => send.specialist), ['syntra', 'technical', 'automation']);
  assert.deepEqual(shared.sends.map(send => send.depth), ['deep_dive', 'deep_dive', 'deep_dive']);
  assert.match(await jp.getByTestId('text-specialist-description').textContent(), /Automation & Workflow Specialist/);
  await jp.getByTestId('button-speak-mobile').click();
  await until(async () => (await jp.getByTestId('voice-active-specialist').textContent()).includes('Nyx'), 'Voice inherits the selected shared perspective');
  await jp.getByTestId('button-voice-specialist-technical').click();
  await until(async () => (await jp.getByTestId('voice-active-specialist').textContent()).includes('Kryon'), 'Synthetic voice can select supported perspective');
  await jp.getByTestId('button-close-voice').click();
  assert.equal(await jp.getByTestId('button-text-specialist-technical').getAttribute('aria-checked'), 'true');
  assert.equal((await snapshot()).conversation.messages.length, 6, 'Changing perspective does not fabricate another exchange');
  results.push({ scenario: 'bottleneck → Syntra → Kryon → Nyx; shared depth, transcript and voice perspective', passed: true, persistedPairs: 3, voiceEvidence: 'synthetic runtime selector only; no audio' });

  await navigate(jp, '/brief');
  await jp.getByTestId('tab-solution-blueprint').click();
  await jp.getByTestId('blueprint-item-reviewer-boundary').waitFor();
  const sectionKeys = ['objectives', 'services', 'architecture', 'integrations', 'workflows', 'roadmap', 'risks', 'tradeoffs', 'value', 'decisions'];
  for (const key of sectionKeys) {
    assert.equal(await jp.getByTestId(`blueprint-section-${key}`).count(), 1, key);
    assert.equal(await jp.getByTestId(`blueprint-section-${key}`).locator('button').first().getAttribute('aria-expanded'), 'true', 'Deep dive expands each section');
  }
  const valueItem = jp.getByTestId('blueprint-item-approval-capacity');
  assert.equal(await valueItem.getByTestId('status-blueprint-approval-capacity').textContent(), 'Assumption');
  assert.match(await valueItem.textContent(), /33\.33 hours\/month/);
  await jp.getByTestId('button-depth-concise').click();
  for (const key of sectionKeys) assert.equal(await jp.getByTestId(`blueprint-section-${key}`).locator('button').first().getAttribute('aria-expanded'), 'false');
  await jp.getByTestId('button-depth-detailed').click();
  assert.equal(await jp.getByTestId('blueprint-section-architecture').locator('button').first().getAttribute('aria-expanded'), 'true');
  assert.equal(await jp.getByTestId('blueprint-section-value').locator('button').first().getAttribute('aria-expanded'), 'false');
  await jp.getByTestId('button-depth-deep_dive').click();
  await jp.screenshot({ path: `${out}/blueprint-390.png` });
  results.push({ scenario: 'ten Blueprint sections, distinct depth expansion and labelled server-derived capacity scenario', passed: true });

  const correction = 'A named reviewer must approve every client commitment; timeouts never grant approval.';
  await jp.getByTestId('button-edit-blueprint-reviewer-boundary').click();
  await jp.getByTestId('input-blueprint-reviewer-boundary').fill(correction);
  await jp.evaluate(() => window.__SYNTRA_TEST__.loseNextBlueprint());
  await jp.getByTestId('button-save-blueprint-reviewer-boundary').click();
  await jp.getByTestId('button-recover-blueprint').waitFor();
  const uncertain = await snapshot();
  const acceptedVersion = uncertain.blueprintStore.document.version;
  await jp.reload({ waitUntil: 'networkidle' });
  await jp.getByTestId('button-recover-blueprint').click();
  await until(async () => await jp.getByTestId('button-recover-blueprint').count() === 0, 'Original Blueprint edit recovers after reload');
  assert.equal(await jp.getByTestId('status-blueprint-reviewer-boundary').textContent(), 'Edited');
  assert.match(await jp.getByTestId('blueprint-item-reviewer-boundary').textContent(), /timeouts never grant approval/);
  const replayed = await snapshot();
  assert.equal(replayed.blueprintCalls.length, 2);
  assert.deepEqual(replayed.blueprintCalls[1], replayed.blueprintCalls[0]);
  assert.equal(replayed.blueprintStore.document.version, acceptedVersion, 'Receipt replay must not add another revision');

  const rejectedDraft = `${correction} Additional operational notes require review before this full document can accept them.`;
  await jp.getByTestId('button-edit-blueprint-reviewer-boundary').click();
  await jp.getByTestId('input-blueprint-reviewer-boundary').fill(rejectedDraft);
  await jp.evaluate(() => window.__SYNTRA_TEST__.rejectNextBlueprint());
  await jp.getByTestId('button-save-blueprint-reviewer-boundary').click();
  await jp.getByTestId('blueprint-operation-error').waitFor();
  await until(async () => !await jp.getByTestId('button-save-blueprint-reviewer-boundary').isDisabled(), 'A proven precommit rejection permits a reviewed correction');
  assert.equal(await jp.getByTestId('input-blueprint-reviewer-boundary').inputValue(), rejectedDraft, 'Definite rejection preserves the unsaved draft');
  assert.equal(await jp.getByTestId('button-recover-blueprint').count(), 0, 'A proven rejected mutation must not become a permanent uncertain retry');
  assert.equal((await snapshot()).blueprintStore.document.version, acceptedVersion);
  await jp.getByTestId('input-blueprint-reviewer-boundary').fill(correction);
  await jp.getByTestId('button-save-blueprint-reviewer-boundary').click();
  await until(async () => await jp.getByTestId('input-blueprint-reviewer-boundary').count() === 0, 'Shorter reviewed correction saves');
  const correctedRejection = await snapshot();
  assert.equal(correctedRejection.blueprintCalls.length, 4);
  assert.notEqual(correctedRejection.blueprintCalls[2].input.requestId, correctedRejection.blueprintCalls[3].input.requestId);

  const routing = jp.getByTestId('blueprint-item-review-routing');
  await routing.getByRole('button', { name: 'Remove Human approval routing', exact: true }).click();
  await routing.getByRole('button', { name: 'Remove note', exact: true }).click();
  await until(async () => await jp.getByTestId('blueprint-item-review-routing').count() === 0, 'Intentional workflow removal becomes visible');
  const removedVersion = (await snapshot()).blueprintStore.document.version;
  await jp.getByTestId('button-regenerate-blueprint').click();
  await until(async () => (await snapshot()).blueprintCalls.length === 6, 'Regeneration reaches domain');
  assert.equal((await snapshot()).blueprintStore.document.version, removedVersion, 'Unchanged sync does not inflate history');
  await navigate(jp, '/');
  await jp.getByTestId('button-text-specialist-automation').click();
  await jp.getByTestId('input-message').fill('Revisit the routing recommendation using our existing constraints.');
  await jp.getByTestId('button-send').click();
  await jp.getByTestId('link-review-blueprint').waitFor();
  await navigate(jp, '/brief');
  await jp.getByTestId('solution-blueprint').waitFor();
  assert.equal(await jp.getByTestId('blueprint-item-review-routing').count(), 0, 'Later matching model suggestion cannot resurrect removal');
  assert.equal(await jp.getByTestId('status-blueprint-reviewer-boundary').textContent(), 'Edited');
  await jp.getByTestId('button-blueprint-history').click();
  const finalBlueprint = (await snapshot()).blueprintStore.document;
  assert.ok(finalBlueprint.history.some(revision => revision.source === 'manual'));
  assert.ok(finalBlueprint.history.some(revision => revision.changes.some(change => change.before && change.after === null)));
  await jp.getByTestId(`blueprint-version-${finalBlueprint.version}`).waitFor();
  results.push({ scenario: 'manual correction original-ID recovery; proven rejection preserves draft and permits new correction; removals survive sync and specialist revisit; meaningful version history', passed: true });

  await jp.getByTestId('button-copy-blueprint').click();
  const blueprintMarkdown = await jp.getByTestId('textarea-manual-copy-blueprint').inputValue();
  assert.ok(blueprintMarkdown.includes(correction));
  assert.ok(blueprintMarkdown.includes('Manually edited'));
  assert.ok(blueprintMarkdown.includes('Assumption'));
  assert.equal((blueprintMarkdown.match(/^## /gm) || []).length, 12, 'All ten sections plus history and next step export');
  assert.ok(blueprintMarkdown.includes('Opening the form does not send this document'));
  const blueprintDownloadReady = jp.waitForEvent('download');
  await jp.getByTestId('button-export-blueprint').click();
  const blueprintDownload = await blueprintDownloadReady;
  assert.equal(blueprintDownload.suggestedFilename(), `syntra-solution-blueprint-v${finalBlueprint.version}.md`);
  assert.equal(await readFile(await blueprintDownload.path(), 'utf8'), blueprintMarkdown);
  await writeFile(`${out}/example-solution-blueprint.md`, '> Synthetic QA example generated through the real Blueprint domain and rendered UI. Model replies, visitor details and storage in this artifact are test fixtures; this is not a real client consultation or a promised implementation.\n\n' + blueprintMarkdown);
  await jp.reload({ waitUntil: 'networkidle' });
  await jp.getByTestId('solution-blueprint').waitFor();
  assert.equal((await snapshot()).blueprintStore.document.version, finalBlueprint.version);
  assert.equal(await jp.getByTestId('status-blueprint-reviewer-boundary').textContent(), 'Edited');
  await jp.getByTestId('link-blueprint-handoff').click();
  assert.equal(await jp.getByTestId('link-approved-contact-enquiry').getAttribute('href'), 'https://digitalprodigy.dev/contact');
  assert.equal((await snapshot()).enquiries.length, 0, 'Review and export must not send an enquiry');
  assert.deepEqual(journey.errors, []);
  const privateContext = await context(1440, 900);
  const privateSnapshot = await privateContext.page.evaluate(() => window.__SYNTRA_TEST__.snapshot());
  assert.equal(privateSnapshot.blueprintStore.document.version, 0);
  assert.equal(Object.values(privateSnapshot.blueprintStore.document.sections).flat().length, 0);
  assert.equal(privateSnapshot.conversation.messages.length, 0);
  assert.deepEqual(privateContext.errors, []);
  results.push({ scenario: 'Blueprint clipboard fallback/export/reload, approved handoff boundary and independent-session isolation', passed: true });
  await privateContext.ctx.close(); await journey.ctx.close();

  const android = await context(390, 844, { isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  const ap = android.page;
  assert.ok(await ap.evaluate(() => navigator.maxTouchPoints > 0));
  assert.match(await ap.evaluate(() => navigator.userAgent), /Android.*Chrome/);
  await ap.getByTestId('button-depth-deep_dive').tap();
  await ap.getByTestId('input-message').fill(bottleneck);
  await ap.getByTestId('button-send').tap();
  await ap.getByTestId('button-explore-technical').waitFor();
  await ap.getByTestId('button-text-specialist-technical').tap();
  await ap.getByTestId('input-message').fill('Map the architecture for our approval portal with a named human reviewer.');
  await ap.getByTestId('button-send').tap();
  await ap.getByTestId('button-explore-automation').waitFor();
  await ap.getByTestId('button-speak-mobile').tap();
  await until(async () => (await ap.getByTestId('voice-active-specialist').textContent()).includes('Kryon'), 'Android-style voice selector inherits Kryon');
  await ap.getByTestId('button-voice-specialist-automation').tap();
  await until(async () => (await ap.getByTestId('voice-active-specialist').textContent()).includes('Nyx'), 'Android-style touch switches supported voice perspective');
  await ap.getByTestId('button-close-voice').tap();
  assert.equal(await ap.getByTestId('button-text-specialist-automation').getAttribute('aria-checked'), 'true');
  await ap.locator('a[href="/brief"]').filter({ visible: true }).first().tap();
  await ap.getByTestId('tab-solution-blueprint').tap();
  await ap.getByTestId('blueprint-item-reviewer-boundary').waitFor();
  const androidSaved = await ap.evaluate(() => window.__SYNTRA_TEST__.snapshot());
  assert.equal(androidSaved.conversation.id, 1);
  assert.equal(androidSaved.conversation.messages.length, 4);
  assert.deepEqual(androidSaved.sends.map(send => send.specialist), ['syntra', 'technical']);
  assert.deepEqual(androidSaved.sends.map(send => send.depth), ['deep_dive', 'deep_dive']);
  assert.equal(androidSaved.voiceConnections, 1);
  await ap.screenshot({ path: `${out}/blueprint-android-style-390.png` });
  const androidDownloadReady = ap.waitForEvent('download');
  await ap.getByTestId('button-export-blueprint').tap();
  const androidDownload = await androidDownloadReady;
  assert.match(await readFile(await androidDownload.path(), 'utf8'), /Reviewer permission boundary/);
  await ap.reload({ waitUntil: 'networkidle' });
  await ap.getByTestId('blueprint-item-reviewer-boundary').waitFor();
  assert.equal((await ap.evaluate(() => window.__SYNTRA_TEST__.snapshot())).blueprintStore.document.version, androidSaved.blueprintStore.document.version);
  await ap.locator('a[href="/"]').filter({ visible: true }).first().tap();
  assert.equal(await ap.getByTestId('button-text-specialist-automation').getAttribute('aria-checked'), 'true');
  assert.equal(await ap.getByTestId('button-depth-deep_dive').getAttribute('aria-checked'), 'true');
  assert.equal((await ap.evaluate(() => window.__SYNTRA_TEST__.snapshot())).conversation.messages.length, 4);
  assert.deepEqual(android.errors, []);
  results.push({ scenario: 'Android-style touch taps: Kryon text → Nyx voice perspective → Blueprint export/reload with shared session and depth',
    passed: true, evidence: 'Desktop Chromium with Android UA, mobile viewport and touch emulation; synthetic voice connection only. No physical phone, microphone or synthesized audio verified.' });
  await android.ctx.close();
  await writeFile(`${out}/results.json`, JSON.stringify({ evidence: 'Real Chromium UI; synthetic local runtime only. No live voice, provider delivery, or cloud persistence certification.', results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, evidence: 'synthetic-runtime browser workflow checks', results }, null, 2));
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ evidence: 'Local synthetic runtime only',
    error: error instanceof Error ? error.message : String(error), completed: results, contexts: browserEvidence }, null, 2));
  throw error;
} finally { await browser.close(); }
