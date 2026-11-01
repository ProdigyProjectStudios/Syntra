/** Opt-in LIVE provider check with recorded synthetic speech through Chromium's
 * real getUserMedia recorder. It calls the deployed model/Azure and creates an
 * isolated consultation. This does NOT certify physical microphones or speakers.
 * Never run from CI without separate explicit approval of live provider usage. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.SYNTRA_LIVE_VOICE !== '1') throw new Error('Set SYNTRA_LIVE_VOICE=1 to authorize this live provider check.');
const base = process.env.SYNTRA_CHECK_URL;
const recording = process.env.SYNTRA_VOICE_WAV;
if (!base || !recording) throw new Error('Provide SYNTRA_CHECK_URL and SYNTRA_VOICE_WAV containing synthetic speech with pauses.');
const target = new URL(base);
if (target.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Live microphone checks require HTTPS.');
const wav = path.resolve(recording);
assert.ok(fs.existsSync(wav), 'The supplied speech recording must exist.');
const expected = Number(process.env.SYNTRA_EXPECTED_VOICE_TURNS || 10);
const duration = Number(process.env.SYNTRA_VOICE_DURATION_MS || 310000);
assert.ok(Number.isInteger(expected) && expected > 0 && expected <= 20);
assert.ok(Number.isInteger(duration) && duration >= 10000 && duration <= 600000);
const moduleName = process.env.SYNTRA_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SYNTRA_CHROMIUM_PATH ? { executablePath: process.env.SYNTRA_CHROMIUM_PATH } : {}),
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.name));
const output = path.resolve(process.env.SYNTRA_VOICE_OUTPUT || 'generated-artifacts/live-voice');
fs.mkdirSync(output, { recursive: true });
try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 });
  await page.getByTestId('button-speak-mobile').click();
  let counts = {};
  const started = Date.now();
  while (Date.now() - started < duration) {
    await page.waitForTimeout(5000);
    // Per-stage counters survive diagnostic mark compaction. No transcript,
    // credential, request/session ID, or raw provider payload enters the report.
    counts = await page.evaluate(() => {
      const marks = performance.getEntriesByName('syntra.voice.event');
      const newest = Math.max(0, ...marks.map(mark => mark.detail?.connection || 0));
      const counts = {};
      for (const mark of marks) {
        const { connection, stage, count } = mark.detail || {};
        if (connection === newest && typeof stage === 'string' && Number.isSafeInteger(count)) counts[stage] = Math.max(counts[stage] || 0, count);
      }
      return counts;
    });
    console.log(JSON.stringify({ elapsedMs: Date.now() - started, recognized: counts['recognition.final'] || 0, replies: counts['turn.reply'] || 0, audio: counts['playback.first-scheduled'] || 0 }));
    if ((counts['synthesis.complete'] || 0) >= expected) break;
    if (counts['connection.failed']) break;
  }
  const persisted = await page.evaluate(async () => {
    const id = Number(localStorage.getItem('dp.activeConversation'));
    if (!id) return null;
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return { status: response.status };
    const conversation = await response.json();
    return {
      status: response.status,
      visitor: conversation.messages.filter(message => message.role === 'visitor').length,
      advisor: conversation.messages.filter(message => message.role === 'advisor').length,
      messages: conversation.messages.length,
      uniqueMessageIds: new Set(conversation.messages.map(message => message.id)).size,
      briefRevision: conversation.brief.revision,
    };
  });
  const latency = await page.evaluate(() => performance.getEntriesByType('measure')
    .filter(entry => entry.name.startsWith('syntra.voice.'))
    .map(entry => ({ name: entry.name, milliseconds: entry.duration })));
  await page.getByTestId('button-close-voice').click();
  const report = { evidence: 'Live deployed providers with recorded synthetic speech through Chromium capture; no physical microphone/speaker claim.', counts, persisted, latency, pageErrors };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.equal(pageErrors.length, 0, 'Browser raised an application error.');
  assert.equal(counts['connection.failed'] || 0, 0, 'Voice connection failed.');
  assert.equal(persisted?.status, 200);
  assert.equal(persisted.visitor, expected, 'Every recorded utterance must persist exactly once.');
  assert.equal(persisted.advisor, expected + 1, 'One advisor reply per turn plus the initial greeting.');
  assert.equal(persisted.uniqueMessageIds, persisted.messages, 'Persisted message identities must be unique.');
  assert.equal(counts['turn.reply'], expected);
  assert.equal(counts['playback.first-scheduled'], expected, 'Every reply must produce actual synthesized PCM.');
} finally {
  await context.close();
  await browser.close();
}
