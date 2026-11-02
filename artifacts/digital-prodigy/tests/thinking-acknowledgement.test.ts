import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ThinkingAcknowledgement } from '../src/lib/development-voice/thinking-acknowledgement.ts';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

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
