import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyntraConsultationRepository, type NativeStorage } from './native-repository.ts';
import { BLUEPRINT_CHANGE_REJECTED, BLUEPRINT_VERSION_CONFLICT, readBlueprintStore } from './blueprint-storage.ts';
import { BLUEPRINT_SECTIONS, emptyBlueprint, type Blueprint, type BlueprintContribution } from './blueprint.ts';

function fixture(scope = crypto.randomUUID()) {
  const files = new Map<string, string>();
  const storage: NativeStorage = {
    async readFile(path) {
      const value = files.get(path);
      if (value === undefined) throw Object.assign(new Error('Missing'), { name: 'StorageFileNotFoundError' });
      return value;
    },
    async writeFile(path, content) { files.set(path, content); },
  };
  return { files, storage, repo: new SyntraConsultationRepository(storage, scope), scope };
}
const contribution: BlueprintContribution = { section: 'architecture', id: 'approval-service', title: 'Approval service',
  detail: 'Enforce reviewer authorization at the API boundary and persist decisions before notifications.',
  status: 'recommendation', evidence: 'Plan our integration' };

test('native legacy sessions expose an empty Blueprint without replacing their stored consultation', async () => {
  const f = fixture();
  await f.repo.ensureSession('detailed');
  const saved = JSON.parse(f.files.values().next().value!);
  delete saved.blueprint;
  f.files.set('private/syntra-consultation.json', JSON.stringify(saved));
  const old = f.files.get('private/syntra-consultation.json');
  assert.equal((await f.repo.getBlueprint(1)).version, 0);
  assert.equal((await f.repo.getSnapshot()).depth, 'detailed');
  assert.equal(f.files.get('private/syntra-consultation.json'), old, 'Reading cannot destructively migrate or clear an old session');
});

test('native Blueprint CAS and durable retries preserve latest corrections across repository reloads', async () => {
  const f = fixture();
  await f.repo.updateBrief(1, { objective: 'Reduce project approval delays' }, 0);
  const initial = await f.repo.getBlueprint(1);
  const itemId = initial.sections.architecture[0].id;
  const first = { version: initial.version, requestId: 'blueprint-edit-original', edit: { section: 'architecture' as const, itemId, title: 'Customer-approved objective' } };
  const edited = await f.repo.mutateBlueprint(1, first, 'update');
  const latest = await f.repo.mutateBlueprint(1, { version: edited.version, requestId: 'blueprint-edit-correction', edit: { section: 'architecture', itemId, detail: 'Preserve our existing reviewer process.' } }, 'update');
  const reloaded = new SyntraConsultationRepository(f.storage, f.scope);
  assert.deepEqual(await reloaded.mutateBlueprint(1, first, 'update'), latest);
  await assert.rejects(reloaded.mutateBlueprint(1, { ...first, edit: { ...first.edit, title: 'Changed intent' } }, 'update'), { status: 409 });
  await assert.rejects(reloaded.mutateBlueprint(1, { ...first, requestId: 'blueprint-stale-version' }, 'update'), { code: BLUEPRINT_VERSION_CONFLICT });
  assert.equal((await reloaded.getBlueprint(1)).sections.architecture[0].status, 'manual');
  assert.equal((await fixture().repo.getBlueprint(1)).version, 0);
});

test('native typed Blueprint contributions commit only on trusted completion and preserve intervening edits', async () => {
  const f = fixture();
  await f.repo.updateBrief(1, { objective: 'Reduce project approval delays' }, 0);
  await f.repo.beginTurn(1, 'native-blueprint-original', 'Plan our integration', 'deep_dive', 'technical');
  await f.repo.attachResponseId('native-blueprint-original', 'native-response-blueprint');
  await f.repo.stageBriefChanges('native-blueprint-original', {}, [contribution]);
  assert.equal((await f.repo.getBlueprint(1)).sections.architecture.some(item => item.id === contribution.id), false);
  const initial = await f.repo.getBlueprint(1), itemId = initial.sections.architecture[0].id;
  await f.repo.mutateBlueprint(1, { version: initial.version, requestId: 'manual-during-model', edit: { section: 'architecture', itemId, detail: 'Preserve this customer correction.' } }, 'update');
  await f.repo.completeTurn('native-blueprint-original', 'native-response-blueprint', 'A focused approval service fits.', 'Plan our integration');
  const saved = await f.repo.getBlueprint(1);
  assert.equal(saved.sections.architecture[0].detail, 'Preserve this customer correction.');
  assert.equal(saved.sections.architecture.find(item => item.id === contribution.id)?.specialist, 'technical');
  await f.repo.completeTurn('native-blueprint-original', 'native-response-blueprint', 'A duplicate completion');
  assert.deepEqual(await f.repo.getBlueprint(1), saved);
  assert.equal((await f.repo.getSnapshot()).messageCount, 2);
});

test('native voice Blueprint changes share the document, discard failed drafts and never create typed turns', async () => {
  const f = fixture();
  await f.repo.updateBrief(1, { objective: 'Reduce project approval delays' }, 0);
  await f.repo.stageNativeVoiceChanges('voice-blueprint-failed', 'Plan our integration', {}, [contribution]);
  await f.repo.discardTurn('voice-blueprint-failed', true);
  assert.equal((await f.repo.getBlueprint(1)).sections.architecture.some(item => item.id === contribution.id), false);
  await f.repo.stageNativeVoiceChanges('voice-blueprint-success', 'Plan our integration', {}, [contribution]);
  await f.repo.completeNativeVoiceTurn('voice-blueprint-success', 'Plan our integration', 'voice-response-blueprint');
  const saved = await f.repo.getBlueprint(1);
  assert.ok(saved.sections.architecture.some(item => item.id === contribution.id));
  await f.repo.completeNativeVoiceTurn('voice-blueprint-success', 'Plan our integration', 'voice-response-blueprint');
  assert.deepEqual(await f.repo.getBlueprint(1), saved);
  const raw = JSON.parse(f.files.values().next().value!);
  assert.equal(raw.turns.length, 0);
  assert.equal(raw.voiceTurnIds.length, 1);
  assert.equal((await f.repo.getSnapshot()).blueprint.version, saved.version);
});

test('malformed durable Blueprint state is rejected instead of silently erasing the deliverable', () => {
  assert.throws(() => readBlueprintStore({ document: null, receipts: 'broken' }), /could not be read/);
  assert.throws(() => readBlueprintStore({ receipts: [] }), /could not be read/);
});

test('native completion cannot overwrite a customer correction to the same specialist item while a model turn is pending', async () => {
  const f = fixture();
  await f.repo.updateBrief(1, { objective: 'Reduce project approval delays' }, 0);
  await f.repo.beginTurn(1, 'native-seed-architecture', 'Plan our integration', 'detailed', 'technical');
  await f.repo.attachResponseId('native-seed-architecture', 'native-seed-response');
  await f.repo.stageBriefChanges('native-seed-architecture', {}, [contribution]);
  await f.repo.completeTurn('native-seed-architecture', 'native-seed-response', 'Use a review boundary.', 'Plan our integration');
  await f.repo.beginTurn(1, 'native-late-architecture', 'Plan our integration with a queue', 'deep_dive', 'technical');
  await f.repo.attachResponseId('native-late-architecture', 'native-late-response');
  await f.repo.stageBriefChanges('native-late-architecture', {}, [{ ...contribution, detail: 'Replace the review boundary with an unattended queue.' }]);
  const before = await f.repo.getBlueprint(1);
  await f.repo.mutateBlueprint(1, { version: before.version, requestId: 'native-customer-correction',
    edit: { section: 'architecture', itemId: contribution.id, detail: 'A named reviewer must approve each client commitment.' } }, 'update');
  await f.repo.completeTurn('native-late-architecture', 'native-late-response', 'The pending design is ready.', 'Plan our integration with a queue');
  const saved = await f.repo.getBlueprint(1);
  assert.equal(saved.sections.architecture.find(item => item.id === contribution.id)?.detail, 'A named reviewer must approve each client commitment.');
  assert.equal(saved.sections.architecture.find(item => item.id === contribution.id)?.status, 'manual');
  assert.equal((await f.repo.getSnapshot()).messageCount, 4);
});

test('known native Blueprint validation and capacity rejections preserve storage and allow a corrected draft', async () => {
  const f = fixture();
  await f.repo.ensureSession('detailed');
  const document: Blueprint = { ...emptyBlueprint(), version: 1, updatedAt: new Date().toISOString() };
  // Exactly 60,000 visible characters, with every individual field valid.
  for (const section of BLUEPRINT_SECTIONS) document.sections[section.id] = Array.from({ length: 8 }, (_, index) => ({
    id: `item_${index}`, title: 'T', detail: 'x'.repeat(748), evidence: 'E',
    status: 'manual', source: 'manual', specialist: 'syntra',
  }));
  const path = 'private/syntra-consultation.json';
  const saved = JSON.parse(f.files.get(path)!);
  saved.blueprint = { document, receipts: [] };
  f.files.set(path, JSON.stringify(saved));
  const before = f.files.get(path);
  const rejected = [
    { status: 400, edit: { section: 'architecture' as const, itemId: 'item_0', title: 'x'.repeat(161) } },
    { status: 404, edit: { section: 'architecture' as const, itemId: 'missing_item', detail: 'Corrected scope' } },
    { status: 422, edit: { section: 'architecture' as const, itemId: 'item_0', detail: 'x'.repeat(1200) } },
  ];
  for (const candidate of rejected) {
    await assert.rejects(f.repo.mutateBlueprint(1, { version: 1, requestId: `rejected-draft-${candidate.status}`, edit: candidate.edit }, 'update'), {
      status: candidate.status, code: BLUEPRINT_CHANGE_REJECTED,
    });
    assert.equal(f.files.get(path), before, 'A rejected edit cannot write a version or a retry receipt');
  }
  const corrected = await f.repo.mutateBlueprint(1, { version: 1, requestId: 'corrected-shorter-draft',
    edit: { section: 'architecture', itemId: 'item_0', detail: 'Keep the current reviewer process.' } }, 'update');
  assert.equal(corrected.version, 2);
  assert.equal(corrected.sections.architecture[0].detail, 'Keep the current reviewer process.');
  assert.deepEqual(JSON.parse(f.files.get(path)!).blueprint.receipts.map((receipt: { requestId: string }) => receipt.requestId), ['corrected-shorter-draft']);
});

test('a lost native storage acknowledgement stays uncertain and the exact original Blueprint retry remains idempotent', async () => {
  const f = fixture();
  await f.repo.updateBrief(1, { objective: 'Reduce project approval delays' }, 0);
  const current = await f.repo.getBlueprint(1);
  const input = { version: current.version, requestId: 'lost-blueprint-storage-ack',
    edit: { section: 'architecture' as const, itemId: current.sections.architecture[0].id, detail: 'A reviewer must approve every change.' } };
  const originalWrite = f.storage.writeFile;
  let loseAcknowledgement = true;
  f.storage.writeFile = async (path, content) => {
    await originalWrite(path, content);
    if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error('Storage acknowledgement lost'); }
  };
  await assert.rejects(f.repo.mutateBlueprint(1, input, 'update'), error => {
    assert.equal((error as { code?: string }).code, undefined, 'A write may have committed, so its pending operation must remain recoverable');
    return /acknowledgement lost/.test((error as Error).message);
  });
  const committed = await f.repo.getBlueprint(1);
  assert.equal(committed.version, current.version + 1);
  await assert.rejects(f.repo.mutateBlueprint(1, { ...input, edit: { ...input.edit, detail: 'x'.repeat(21000) } }, 'update'), error => {
    assert.equal((error as { code?: string }).code, undefined, 'A changed old identity must never be classified as a rejected new draft');
    assert.equal((error as { status: number }).status, 409);
    return true;
  });
  assert.deepEqual(await f.repo.mutateBlueprint(1, input, 'update'), committed);
  assert.equal(JSON.parse(f.files.get('private/syntra-consultation.json')!).blueprint.receipts.length, 1);
});
