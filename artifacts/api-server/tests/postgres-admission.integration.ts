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
    create table conversations (id serial primary key, owner_hash text, title text not null default 'New conversation', depth text not null default 'detailed', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
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
