import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBlueprintOperationStore, type PendingBlueprintOperation } from '../src/lib/pending-blueprint-operation.ts';

class Memory {
  values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  dropWrite = false;
  dropRemove = false;
  getItem(key: string) { if (this.failRead) throw new Error('Storage unavailable'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrite) throw new Error('Storage unavailable'); if (!this.dropWrite) this.values.set(key, value); }
  removeItem(key: string) { if (!this.dropRemove) this.values.delete(key); }
}
const operation: PendingBlueprintOperation = { id: 1, kind: 'update', input: { version: 3,
  requestId: 'original-blueprint-change', edit: { section: 'architecture', itemId: 'reviewer-boundary',
    title: 'Named reviewer required', detail: 'Every client commitment needs approval from a named reviewer.',
    details: [{ label: 'Exception', value: 'An expired request stays pending; it is never approved automatically.' }] } } };

test('Blueprint reload recovery preserves complete original edit and returns independent values', () => {
  const storage = new Memory();
  createBlueprintOperationStore('native-session-a', () => storage).save(operation);
  const reloaded = createBlueprintOperationStore('native-session-a', () => storage).load(1);
  assert.deepEqual(reloaded, operation);
  if (reloaded?.kind === 'update') reloaded.input.edit.detail = 'In-memory mutation';
  assert.deepEqual(createBlueprintOperationStore('native-session-a', () => storage).load(1), operation);
});

test('Blueprint recovery separates native identities, standalone runtime and conversation IDs', () => {
  const storage = new Memory();
  const owner = createBlueprintOperationStore('session-a', () => storage);
  owner.save(operation);
  assert.equal(createBlueprintOperationStore('session-b', () => storage).load(1), null);
  assert.equal(createBlueprintOperationStore('replit', () => storage).load(1), null);
  assert.equal(owner.load(2), null);
  owner.save({ id: 2, kind: 'regenerate', input: { version: 0, requestId: 'second-document-sync' } });
  assert.deepEqual(owner.load(1), operation);
  assert.equal(owner.load(2)?.kind, 'regenerate');
});

test('uncertain Blueprint intent cannot be replaced by a new identity, version, kind or edit', () => {
  const storage = new Memory();
  const store = createBlueprintOperationStore('scope', () => storage);
  store.save(operation);
  const changed: PendingBlueprintOperation[] = [
    { ...operation, input: { ...operation.input, requestId: 'another-blueprint-change' } },
    { ...operation, input: { ...operation.input, version: 4 } },
    { id: 1, kind: 'regenerate', input: { version: 3, requestId: operation.input.requestId } },
    { ...operation, input: { ...operation.input, edit: { ...operation.input.edit, remove: true } } },
  ];
  for (const next of changed) {
    assert.throws(() => store.save(next), /Recover the earlier Blueprint change/);
    assert.deepEqual(store.load(1), operation);
  }
  store.save(operation);
  assert.deepEqual(store.load(1), operation);
});

test('Blueprint acknowledgement removes only its own original request', () => {
  const storage = new Memory();
  const store = createBlueprintOperationStore('scope', () => storage);
  store.save(operation);
  store.clear(1, 'stale-blueprint-change');
  assert.deepEqual(store.load(1), operation);
  store.clear(1, operation.input.requestId);
  assert.equal(store.load(1), null);
});

test('Blueprint storage failure rejects admission rather than silently losing retry identity', () => {
  const storage = new Memory();
  const store = createBlueprintOperationStore('scope', () => storage);
  storage.failRead = true;
  assert.throws(() => store.save(operation));
  storage.failRead = false;
  storage.failWrite = true;
  assert.throws(() => store.save(operation));
  assert.equal(storage.values.size, 0);
  storage.failWrite = false;
  storage.dropWrite = true;
  assert.throws(() => store.save(operation), /No Blueprint change was sent/);
  assert.equal(storage.values.size, 0);
});

test('a failed Blueprint receipt cleanup preserves a recoverable original request', () => {
  const storage = new Memory();
  const store = createBlueprintOperationStore('scope', () => storage);
  store.save(operation);
  storage.dropRemove = true;
  assert.throws(() => store.clear(1, operation.input.requestId), /retry record could not be cleared/);
  assert.deepEqual(store.load(1), operation);
});

test('malformed saved Blueprint work cannot be silently replaced or cleared', () => {
  const storage = new Memory();
  const store = createBlueprintOperationStore('scope', () => storage);
  store.save(operation);
  const key = [...storage.values.keys()][0];
  for (const invalid of ['{corrupt', JSON.stringify({ ...operation, id: 2 }), JSON.stringify({ ...operation, input: { version: -1 } })]) {
    storage.values.set(key, invalid);
    assert.throws(() => store.load(1));
    assert.throws(() => store.save(operation));
    assert.throws(() => store.clear(1, operation.input.requestId));
    assert.equal(storage.values.get(key), invalid);
  }
});

test('invalid Blueprint operations are rejected before writing a retry record', () => {
  const storage = new Memory();
  const store = createBlueprintOperationStore('scope', () => storage);
  const invalid = [
    { ...operation, id: 0 },
    { ...operation, input: { ...operation.input, version: -1 } },
    { ...operation, input: { ...operation.input, requestId: 'short' } },
    { ...operation, input: { ...operation.input, edit: { ...operation.input.edit, section: 'unknown' } } },
    { ...operation, input: { ...operation.input, edit: { ...operation.input.edit, title: 'a'.repeat(161) } } },
    { ...operation, input: { ...operation.input, edit: { ...operation.input.edit, detail: 'a'.repeat(1201) } } },
    { ...operation, input: { ...operation.input, edit: { ...operation.input.edit, details: Array(7).fill({ label: 'Detail', value: 'Value' }) } } },
  ];
  for (const next of invalid) {
    assert.throws(() => store.save(next as PendingBlueprintOperation));
    assert.equal(storage.values.size, 0);
  }
});
