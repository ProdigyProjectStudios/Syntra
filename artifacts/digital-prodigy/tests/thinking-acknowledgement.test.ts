import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ThinkingAcknowledgement, needsThinkingAcknowledgement } from '../src/lib/development-voice/thinking-acknowledgement.ts';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('social conversation and simple answers never trigger thinking speech', () => {
  for (const text of [
    'Hi', 'Hello Syntra!', 'Hey, how are you today?',
    'Thank you very much Syntra', 'Yes please that sounds good',
    'Can you hear me please?', 'What is your name?', 'Tell me more please Syntra',
    'My budget is five thousand pounds', 'We use Slack and Google Sheets',
    'The deadline is the end of November', 'We have twelve people in our team',
  ]) assert.equal(needsThinkingAcknowledgement(text), false, text);
});

test('substantial analysis and planning questions can trigger thinking speech', () => {
  for (const text of [
    'Compare the costs of building this ourselves versus using an existing platform.',
    'How should we design the integration between our CRM and client portal?',
    'Calculate how much time we could save across twenty staff working five hours each.',
    'Hello, can you evaluate the security trade-offs in this architecture?',
    'Why does our workflow fail when multiple approvals arrive at the same time? Please diagnose it.',
  ]) assert.equal(needsThinkingAcknowledgement(text), true, text);
});

test('thinking audio is interruptible and stale callbacks cannot restart it', async () => {
  const acknowledgement = new ThinkingAcknowledgement();
  let signal!: AbortSignal;
  let onStart!: () => void;
  acknowledgement.start(async (text, abort, start) => {
    assert.equal(text, 'Let me look into that.');
    signal = abort; onStart = start;
    await new Promise<void>(resolve => abort.addEventListener('abort', () => resolve(), { once: true }));
  });
  await settle();
  onStart();
  assert.equal(acknowledgement.playing, true);
  acknowledgement.stop();
  assert.equal(signal.aborted, true);
  onStart();
  assert.equal(acknowledgement.playing, false);
  await settle();
});

test('fast replies cancel acknowledgements before synthesis; failures stay optional', async () => {
  const acknowledgement = new ThinkingAcknowledgement();
  let calls = 0;
  acknowledgement.start(async () => { calls++; });
  acknowledgement.stop();
  await settle();
  assert.equal(calls, 0);
  acknowledgement.start(async () => { calls++; throw new Error('Speech unavailable'); });
  await settle();
  assert.equal(calls, 1);
  assert.equal(acknowledgement.playing, false);
});
