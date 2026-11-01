/** Real-browser UI regressions with an explicitly synthetic, tab-local runtime.
 * No model, speech provider, database or external enquiry is contacted. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = process.env.SYNTRA_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(source.startsWith('/') ? pathToFileURL(source).href : source);
const base = process.env.SYNTRA_CHECK_URL || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Synthetic runtime checks require a local preview; never inject them into production.');
}
const out = resolve('generated-artifacts/browser-workflows');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox'],
});
const results = [];
const fixture = () => {
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
      receipts: {}, sends: [], enquiries: [], failNextMessage: false, failNextEnquiry: false, voiceConnections: 0 };
  }
  const save = () => localStorage.setItem(key, JSON.stringify(saved));
  const copy = value => structuredClone(value);
  localStorage.setItem('dp.activeConversation', '1');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {
    throw new DOMException('Synthetic clipboard denial', 'NotAllowedError');
  } } });
  window.__SYNTRA_TEST__ = {
    snapshot: () => copy(saved),
    loseNextMessage: () => { saved.failNextMessage = true; save(); },
    loseNextEnquiry: () => { saved.failNextEnquiry = true; save(); },
    bumpBrief: () => { saved.conversation.brief.revision++; saved.conversation.brief.timeline = 'Updated after review.'; save();
      window.__SYNTRA_TEST__.emit?.({ type: 'conversation-updated' }); },
  };
  window.__SYNTRA_RUNTIME__ = {
    sessions: { list: async () => [{ ...copy(saved.conversation), messageCount: saved.conversation.messages.length }],
      create: async () => copy(saved.conversation), get: async () => copy(saved.conversation) },
    messages: { send: async (_id, input) => {
      saved.sends.push(copy(input));
      if (saved.receipts[input.requestId]) { save(); return { ...copy(saved.receipts[input.requestId]), brief: copy(saved.conversation.brief) }; }
      const next = saved.conversation.messages.length + 1;
      const visitorMessage = { id: next, role: 'visitor', content: input.content, depth: input.depth, createdAt: new Date().toISOString() };
      const message = { id: next + 1, role: 'advisor', content: 'Synthetic reply: which system holds your projects?', depth: input.depth, createdAt: new Date().toISOString() };
      saved.conversation.messages.push(visitorMessage, message);
      const reply = { visitorMessage, message, brief: copy(saved.conversation.brief), suggestedNextSteps: [] };
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
      saved.conversation.brief.revision++; save(); return copy(saved.conversation.brief);
    } },
    services: async () => [],
    booking: { contacts: async () => [{ id: 'enquiry', kind: 'link', label: 'Approved enquiry form',
      detail: 'External form; nothing is sent automatically.', href: 'https://digitalprodigy.dev/contact' }],
      submitEnquiry: async input => {
        saved.enquiries.push(copy(input));
        const fail = saved.failNextEnquiry; saved.failNextEnquiry = false; save();
        if (fail) throw new Error('Synthetic lost enquiry acknowledgement');
        return { status: 'confirmed', reference: 'SYNTHETIC-TEST-ONLY' };
      } },
    voice: { available: true, connect: async (_id, emit) => {
      saved.voiceConnections++; save(); window.__SYNTRA_TEST__.emit = emit;
      emit({ type: 'state', state: 'listening' });
      return { close: () => emit({ type: 'state', state: 'closed' }), interrupt() {}, setMuted() {} };
    } },
  };
};
async function context(width = 390, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.addInitScript(fixture);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep every fixture action local, including accidental external navigation.
  await ctx.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin
    || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto(base, { waitUntil: 'networkidle' });
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
  await writeFile(`${out}/results.json`, JSON.stringify({ evidence: 'Real Chromium UI; synthetic local runtime only. No live voice, provider delivery, or cloud persistence certification.', results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, evidence: 'synthetic-runtime browser workflow checks', results }, null, 2));
} finally { await browser.close(); }
