import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAudioPreparation } from '../src/lib/development-voice/audio-preparation.ts';

function fixture() {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const contexts: Context[] = [];
  let activeGesture = false;
  class Context {
    resumes = 0;
    closes = 0;
    resumedInGesture = false;
    constructor() { contexts.push(this); }
    async resume() { this.resumes++; this.resumedInGesture = activeGesture; }
    async close() { this.closes++; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { AudioContext: Context } });
  return {
    contexts, preparation: createAudioPreparation(),
    gesture(work: () => void) { activeGesture = true; try { work(); } finally { activeGesture = false; } },
    restore() { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); },
  };
}

test('output unlock happens synchronously in the gesture and is adopted only once', t => {
  const f = fixture(); t.after(f.restore);
  const cancel = new AbortController();
  f.gesture(() => f.preparation.prepare(cancel.signal));
  assert.equal(f.contexts[0].resumedInGesture, true);
  assert.equal(f.contexts[0].resumes, 1);
  assert.equal(f.preparation.take(), f.contexts[0]);
  assert.equal(f.preparation.take(), undefined);
  cancel.abort();
  assert.equal(f.contexts[0].closes, 0, 'Connection owns adopted audio; preparation cannot retire it');
});

test('close before connect and rapid reopen release only their unadopted contexts', t => {
  const f = fixture(); t.after(f.restore);
  const first = new AbortController(), second = new AbortController();
  f.preparation.prepare(first.signal);
  f.preparation.prepare(second.signal);
  assert.equal(f.contexts[0].closes, 1);
  first.abort();
  assert.equal(f.contexts[1].closes, 0);
  second.abort();
  assert.equal(f.contexts[1].closes, 1);
  assert.equal(f.preparation.take(), undefined);
  f.preparation.prepare(second.signal);
  assert.equal(f.contexts.length, 2, 'An already dismissed gesture never allocates audio');
});

test('unsupported or blocked gesture preparation defers to normal connection errors', t => {
  const f = fixture(); t.after(f.restore);
  (globalThis as unknown as { window: unknown }).window = undefined;
  assert.doesNotThrow(() => f.preparation.prepare(new AbortController().signal));
  assert.equal(f.preparation.take(), undefined);
});
