import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { pool, type DatabaseClient } from '@workspace/db';
import { ConsultationService, type AdvisorResult } from '@workspace/consultation';
import { repository, repositoryForTransaction, withConsultationTransaction, type ConsultationTransaction } from '../src/lib/consultation-repository';
import { createPostgresConversationAdmissionGate } from '../src/lib/postgres-admission';
import { withPostgresQueryDeadline } from '../src/lib/postgres-query-deadline';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const gate = () => createPostgresConversationAdmissionGate<DatabaseClient, ConsultationTransaction>(pool, withConsultationTransaction);
const reply: AdvisorResult = { reply: 'A focused portal fits. Who approves the work?', changes: {}, suggestedNextSteps: [] };
before(async () => {
  // Schema is created and destroyed by the loopback-only test runner.
  await pool.query(`
    create table conversations (id serial primary key, owner_hash text, title text not null default 'New conversation', depth text not null default 'detailed', blueprint jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table messages (id serial primary key, conversation_id integer not null references conversations(id) on delete cascade, role text not null, content text not null, depth text not null default 'detailed', created_at timestamptz not null default now());
    create table briefs (id serial primary key, conversation_id integer not null unique references conversations(id) on delete cascade, revision integer not null default 0, provenance jsonb not null default '{}', objective text, service text, proposed_solution text, requirements text, integrations text, budget text, timeline text, next_step text, updated_at timestamptz not null default now());
    create table consultation_turns (id serial primary key, conversation_id integer not null references conversations(id) on delete cascade, request_id text not null, response jsonb not null, unique(conversation_id,request_id));
  `);
});
after(() => pool.end());

test('real PostgreSQL excludes autoscaled model overlap, allows manual edits and replays one atomic pair', async () => {
  const conversation = await repository.create('synthetic-owner-a', 'detailed');
  const input = { content: 'Actually change the budget to £6000', depth: 'detailed' as const, requestId: 'postgres-original-request' };
  const started = deferred<void>(), finish = deferred<AdvisorResult>();
  let modelCalls = 0;
  const first = gate().run(`synthetic-owner-a:${conversation.id}`, async transaction => {
    const service = new ConsultationService(repositoryForTransaction(transaction), { consult: async () => {
      modelCalls++; started.resolve(); return finish.promise;
    } });
    return service.send('synthetic-owner-a', conversation.id, input);
  });
  await started.promise;
  await assert.rejects(gate().run(`synthetic-owner-a:${conversation.id}`, async () => { modelCalls++; }), { status: 409 });
  const manual = await repository.editBrief('synthetic-owner-a', conversation.id, { budget: '£7000' }, 0);
  assert.equal(manual.provenance.budget?.status, 'manual', 'No row lock blocks a manual edit during generation');
  finish.resolve({ ...reply, changes: { budget: { value: '£6000', status: 'confirmed', evidence: input.content } } });
  const saved = await first;
  assert.equal(saved.brief.budget, '£7000');
  const restored = await repository.get('synthetic-owner-a', conversation.id);
  assert.equal(restored?.messages.length, 3);
  const replay = await gate().run(`synthetic-owner-a:${conversation.id}`, transaction => new ConsultationService(repositoryForTransaction(transaction), {
    consult: async () => { modelCalls++; return reply; },
  }).send('synthetic-owner-a', conversation.id, input));
  assert.equal(replay.message.id, saved.message.id);
  assert.equal(modelCalls, 1);
  assert.equal((await repository.get('synthetic-owner-a', conversation.id))?.messages.length, 3);
});

test('outer rollback removes a saved inner pair and receipt without poisoning the next admission', async () => {
  const conversation = await repository.create('synthetic-owner-rollback', 'concise');
  const input = { content: 'Plan a portal', depth: 'concise' as const, requestId: 'postgres-rollback-request' };
  await assert.rejects(gate().run(`synthetic-owner-rollback:${conversation.id}`, async transaction => {
    const scoped = repositoryForTransaction(transaction);
    const saved = await new ConsultationService(scoped, { consult: async () => reply }).send('synthetic-owner-rollback', conversation.id, input);
    assert.ok(saved.message.id);
    throw new Error('Synthetic failure before outer commit');
  }), /Synthetic failure/);
  assert.equal((await repository.get('synthetic-owner-rollback', conversation.id))?.messages.length, 1);
  assert.equal(await repository.replay('synthetic-owner-rollback', conversation.id, input.requestId), null);
  const saved = await gate().run(`synthetic-owner-rollback:${conversation.id}`, transaction => new ConsultationService(repositoryForTransaction(transaction), {
    consult: async () => reply,
  }).send('synthetic-owner-rollback', conversation.id, input));
  assert.ok(saved.message.id);
  assert.equal((await repository.get('synthetic-owner-rollback', conversation.id))?.messages.length, 3);
});

test('a saturated real pool commits on its one pinned connection without checking out a second', async () => {
  const conversation = await repository.create('synthetic-owner-capacity', 'concise');
  const held: DatabaseClient[] = [];
  try {
    for (let index = 0; index < 9; index++) held.push(await pool.connect());
    const saved = await gate().run(`synthetic-owner-capacity:${conversation.id}`, transaction => new ConsultationService(repositoryForTransaction(transaction), {
      consult: async () => reply,
    }).send('synthetic-owner-capacity', conversation.id, { content: 'Plan the workflow', depth: 'concise', requestId: 'postgres-capacity-request' }));
    assert.ok(saved.message.id);
  } finally { held.forEach(client => client.release()); }
});

test('a different owner cannot reach the model or mutate another conversation through the distributed gate', async () => {
  const conversation = await repository.create('synthetic-owner-private', 'detailed');
  let modelCalls = 0;
  await assert.rejects(gate().run(`synthetic-owner-other:${conversation.id}`, transaction => new ConsultationService(repositoryForTransaction(transaction), {
    consult: async () => { modelCalls++; return reply; },
  }).send('synthetic-owner-other', conversation.id, { content: 'Try another session', depth: 'detailed', requestId: 'postgres-isolation-request' })), { status: 404 });
  assert.equal(modelCalls, 0);
  assert.equal((await repository.get('synthetic-owner-private', conversation.id))?.messages.length, 1);
});

test('node-postgres query deadlines bound a real stalled database statement', async () => {
  const client = await pool.connect();
  try {
    await assert.rejects(withPostgresQueryDeadline(client, 20).query('select pg_sleep(1)'), /timeout/i);
  } finally { client.release(true); }
});

test('real PostgreSQL Blueprint corrections survive an in-flight specialist response and original receipt replay', async () => {
  const owner = 'synthetic-blueprint-owner';
  const conversation = await repository.create(owner, 'deep_dive');
  await repository.editBrief(owner, conversation.id, {
    objective: 'Reduce email approval chasing for a production studio',
    requirements: 'A human reviewer approves every client commitment',
    integrations: 'Existing project management system; API access needs verification',
  }, 0);
  const architecture = { section: 'architecture' as const, id: 'approval-boundary', title: 'Approval boundary',
    detail: 'Use a reviewer queue before releasing client work.', status: 'recommendation' as const, evidence: 'Map the architecture around the approval queue.' };
  const initialInput = { content: 'Map the architecture around the approval queue.', depth: 'deep_dive' as const,
    specialist: 'technical' as const, requestId: 'postgres-blueprint-initial' };
  await gate().run(`${owner}:${conversation.id}`, transaction => new ConsultationService(repositoryForTransaction(transaction), {
    consult: async () => ({ ...reply, blueprintChanges: [architecture] }),
  }).send(owner, conversation.id, initialInput));
  const receipt = await pool.query<{ duplicated_document: boolean }>(
    "select response ? 'blueprint' as duplicated_document from consultation_turns where conversation_id = $1 and request_id = $2",
    [conversation.id, initialInput.requestId],
  );
  assert.equal(receipt.rows[0]?.duplicated_document, false, 'Turn receipts retain the immutable pair, without duplicating the evolving Blueprint');
  const before = await repository.getBlueprint(owner, conversation.id);
  assert.ok(before.sections.architecture.some(item => item.id === architecture.id));
  const started = deferred<void>(), finish = deferred<AdvisorResult>();
  const lateInput = { ...initialInput, content: 'Consider automating the routing, while preserving human decisions.',
    specialist: 'automation' as const, requestId: 'postgres-blueprint-late-model' };
  const pending = gate().run(`${owner}:${conversation.id}`, transaction => new ConsultationService(repositoryForTransaction(transaction), {
    consult: async () => { started.resolve(); return finish.promise; },
  }).send(owner, conversation.id, lateInput));
  await started.promise;
  const correction = { version: before.version, requestId: 'postgres-blueprint-manual', edit: {
    section: 'architecture' as const, itemId: architecture.id, detail: 'A named reviewer must approve every client commitment.',
  } };
  const edited = await repository.mutateBlueprint(owner, conversation.id, correction, 'update');
  assert.equal(edited.sections.architecture.find(item => item.id === architecture.id)?.status, 'manual');
  finish.resolve({ ...reply, blueprintChanges: [{ ...architecture, detail: 'Automatically release work after a timer.' }] });
  const completed = await pending;
  assert.equal(completed.blueprint?.sections.architecture.find(item => item.id === architecture.id)?.detail, correction.edit.detail);
  const latest = await repository.getBlueprint(owner, conversation.id);
  assert.equal(latest.sections.architecture.find(item => item.id === architecture.id)?.status, 'manual');
  assert.ok(latest.version >= edited.version);
  const replay = await repository.replay(owner, conversation.id, initialInput.requestId);
  assert.deepEqual(replay?.blueprint, latest, 'Old message receipt must attach the current Blueprint, not overwrite the correction');
  const retried = await repository.mutateBlueprint(owner, conversation.id, correction, 'update');
  assert.deepEqual(retried, latest, 'Original mutation receipt replays the newest document');
  await assert.rejects(repository.mutateBlueprint(owner, conversation.id, {
    ...correction, requestId: 'postgres-blueprint-stale-version',
  }, 'update'), { status: 409 });
  await assert.rejects(repository.mutateBlueprint(owner, conversation.id, {
    ...correction, edit: { ...correction.edit, detail: 'Changed intent under an old identity' },
  }, 'update'), { status: 409 });
  await assert.rejects(repository.getBlueprint('synthetic-other-owner', conversation.id), { status: 404 });
  await assert.rejects(repository.mutateBlueprint('synthetic-other-owner', conversation.id, correction, 'update'), { status: 404 });
  assert.equal((await repository.get(owner, conversation.id))?.messages.length, 5);
});

test('real PostgreSQL Blueprint removals survive regeneration and repeated specialist suggestions', async () => {
  const owner = 'synthetic-blueprint-removal';
  const conversation = await repository.create(owner, 'detailed');
  await repository.editBrief(owner, conversation.id, { objective: 'Improve client approval routing' }, 0);
  const contribution = { section: 'workflows' as const, id: 'optional-reminder', title: 'Optional reminder',
    detail: 'Notify the assigned reviewer when an approval is waiting.', status: 'recommendation' as const, evidence: 'Consider reminder routing.' };
  async function suggest(requestId: string) {
    return gate().run(`${owner}:${conversation.id}`, transaction => new ConsultationService(repositoryForTransaction(transaction), {
      consult: async () => ({ ...reply, blueprintChanges: [contribution] }),
    }).send(owner, conversation.id, { content: 'Consider reminder routing.', depth: 'detailed', specialist: 'automation', requestId }));
  }
  await suggest('postgres-removal-first');
  const before = await repository.getBlueprint(owner, conversation.id);
  assert.ok(before.sections.workflows.some(item => item.id === contribution.id));
  const removed = await repository.mutateBlueprint(owner, conversation.id, { version: before.version,
    requestId: 'postgres-removal-edit', edit: { section: 'workflows', itemId: contribution.id, remove: true } }, 'update');
  const regenerated = await repository.mutateBlueprint(owner, conversation.id, {
    version: removed.version, requestId: 'postgres-removal-regenerate',
  }, 'regenerate');
  assert.equal(regenerated.sections.workflows.some(item => item.id === contribution.id), false);
  await suggest('postgres-removal-second');
  const reloaded = await repository.getBlueprint(owner, conversation.id);
  assert.equal(reloaded.sections.workflows.some(item => item.id === contribution.id), false);
  assert.ok(reloaded.removedItemIds.length > 0);
});

test('real PostgreSQL outer rollback removes a Blueprint mutation and its retry receipt together', async () => {
  const owner = 'synthetic-blueprint-rollback';
  const conversation = await repository.create(owner, 'detailed');
  await repository.editBrief(owner, conversation.id, { objective: 'Reduce approval delays' }, 0);
  const before = await repository.getBlueprint(owner, conversation.id);
  const item = before.sections.architecture.find(item => item.id === 'plan_boundaries');
  assert.ok(item);
  const input = { version: before.version, requestId: 'postgres-blueprint-rollback-edit',
    edit: { section: 'architecture' as const, itemId: item.id, detail: 'The approval API must validate the named reviewer before recording any client commitment.' } };
  await assert.rejects(gate().run(`${owner}:${conversation.id}`, async transaction => {
    const changed = await repositoryForTransaction(transaction).mutateBlueprint(owner, conversation.id, input, 'update');
    assert.ok(changed.version > before.version);
    throw new Error('Synthetic outer transaction failure');
  }), /Synthetic outer transaction failure/);
  assert.deepEqual(await repository.getBlueprint(owner, conversation.id), before);
  const retry = await repository.mutateBlueprint(owner, conversation.id, input, 'update');
  assert.equal(retry.sections.architecture.find(candidate => candidate.id === item.id)?.detail, input.edit.detail);
  assert.ok(retry.version > before.version);
});
