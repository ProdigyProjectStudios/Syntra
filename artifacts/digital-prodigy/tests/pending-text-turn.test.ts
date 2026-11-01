import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPendingTextTurnStore, type PendingTextTurn } from '../src/lib/pending-text-turn.ts';

class Memory {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) { if (this.fail) throw new Error('Private browser failure'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('Private browser failure'); this.values.set(key, value); }
  removeItem(key: string) { if (this.fail) throw new Error('Private browser failure'); this.values.delete(key); }
}
const attempt: PendingTextTurn = { id: 1, content: 'Plan the private approvals workflow', depth: 'deep_dive', specialist: 'technical', requestId: 'original-request', previousMessageIds: [1, 2] };

test('typed reload recovery preserves exact request identity, depth, specialist and earlier message IDs', () => {
  const storage = new Memory();
  createPendingTextTurnStore('native-session-a', () => storage).save(attempt);
  const restored = createPendingTextTurnStore('native-session-a', () => storage).load(1);
  assert.deepEqual(restored, attempt);
  restored!.previousMessageIds.push(3);
  assert.deepEqual(createPendingTextTurnStore('native-session-a', () => storage).load(1), attempt);
});

test('typed recovery isolates native runtime scopes and separate consultations', () => {
  const storage = new Memory();
  const owner = createPendingTextTurnStore('session-a', () => storage);
  owner.save(attempt);
  assert.equal(createPendingTextTurnStore('session-b', () => storage).load(1), null);
  assert.equal(owner.load(2), null);
  assert.equal(createPendingTextTurnStore('replit', () => storage).load(1), null);
});

test('uncertain typed work cannot be replaced with a new ID, content, depth or specialist', () => {
  const storage = new Memory();
  const store = createPendingTextTurnStore('scope', () => storage);
  store.save(attempt);
  for (const change of [{ requestId: 'new-request' }, { content: 'Another question' }, { depth: 'concise' as const }, { specialist: 'automation' as const }]) {
    assert.throws(() => store.save({ ...attempt, ...change }), /Recover the earlier message/);
    assert.deepEqual(store.load(1), attempt);
  }
  store.save(attempt);
  assert.deepEqual(store.load(1), attempt);
});

test('typed acknowledgement clears only its own original request', () => {
  const storage = new Memory();
  const store = createPendingTextTurnStore('scope', () => storage);
  store.save(attempt);
  store.clear(1, 'stale-request');
  assert.deepEqual(store.load(1), attempt);
  store.clear(1, attempt.requestId);
  assert.equal(store.load(1), null);
});

test('storage failures and malformed retries fail closed without exposing underlying errors', () => {
  const storage = new Memory();
  const store = createPendingTextTurnStore('scope', () => storage);
  storage.fail = true;
  assert.throws(() => store.save(attempt), error => error instanceof Error && !error.message.includes('Private'));
  assert.throws(() => store.load(1));
  storage.fail = false;
  store.save(attempt);
  for (const key of storage.values.keys()) storage.values.set(key, '{corrupt');
  assert.throws(() => store.load(1));
  assert.throws(() => store.save(attempt));
  assert.equal([...storage.values.values()][0], '{corrupt', 'Unknown original work is not silently replaced');
});

test('invalid new attempts cannot poison safe retry storage before a model send', () => {
  const storage = new Memory();
  const store = createPendingTextTurnStore('scope', () => storage);
  for (const change of [{ content: 'x'.repeat(12001) }, { requestId: 'bad' }, { id: -1 }, { previousMessageIds: [-4] }]) {
    assert.throws(() => store.save({ ...attempt, ...change }));
    assert.equal(storage.values.size, 0);
  }
});
