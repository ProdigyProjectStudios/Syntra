import test from 'node:test';
import assert from 'node:assert/strict';

// Run against the managed development workflows. Uses synthetic sessions only.
const origin = 'http://localhost:80';
function browser() {
  let cookie = '';
  return async (path, method = 'GET', body, extraHeaders = {}) => {
    const response = await fetch(origin + '/api' + path, {
      method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
}
test('private Replit API, brief concurrency and real AI persistence', { timeout: 180000 }, async t => {
  const a = browser(), b = browser();
  const created = await a('/conversations', 'POST', { depth: 'detailed' });
  assert.equal(created.status, 201);
  const id = created.body.id;
  console.info('Synthetic API test session:', id);
  await t.test('private cookie and no shared caching', () => {
    assert.match(created.headers.get('set-cookie'), /HttpOnly/i);
    assert.equal(created.headers.get('cache-control'), 'no-store');
    assert.equal(created.headers.get('access-control-allow-origin'), null);
  });
  await t.test('owner-scoped read, history, brief edit and voice', async () => {
    assert.equal((await a(`/conversations/${id}`)).status, 200);
    assert.equal((await b(`/conversations/${id}`)).status, 404);
    const history = await b('/conversations');
    assert.ok(!history.body.some(c => c.id === id));
    assert.equal((await b(`/conversations/${id}/brief`, 'PATCH', { revision: 0, budget: 'stolen' })).status, 404);
    assert.equal((await b('/voice/sessions', 'POST', { conversationId: id })).status, 404);
  });
  await t.test('CSRF rejects foreign origin without mutating data', async () => {
    assert.equal((await a(`/conversations/${id}/brief`, 'PATCH', { revision: 0, budget: 'stolen' }, { origin: 'https://foreign.example' })).status, 403);
    assert.equal((await a(`/conversations/${id}/brief`)).body.budget, null);
  });
  await t.test('manual update, clear and stale revision conflict', async () => {
    const saved = await a(`/conversations/${id}/brief`, 'PATCH', { revision: 0, budget: '£9000', integrations: 'Slack' });
    assert.equal(saved.status, 200); assert.equal(saved.body.provenance.budget.status, 'manual');
    const conflict = await a(`/conversations/${id}/brief`, 'PATCH', { revision: 0, budget: '£1' });
    assert.equal(conflict.status, 409);
    const cleared = await a(`/conversations/${id}/brief`, 'PATCH', { revision: saved.body.revision, integrations: null });
    assert.equal(cleared.body.integrations, null); assert.equal(cleared.body.provenance.integrations.status, 'manual');
  });
  await t.test('voice cannot claim a connected channel', async () => {
    const voice = await a('/voice/sessions', 'POST', { conversationId: id });
    assert.equal(voice.body.status, 'unavailable'); assert.equal(voice.body.transport, 'none');
  });
  const request = { requestId: crypto.randomUUID(), content: 'I run a design studio. I need clients to approve designs and leave comments in one client portal. Our objective is faster approvals. Budget is undecided and the deadline is not set. What should our first release include?', depth: 'detailed' };
  let reply;
  await t.test('real provider reply is atomic, grounded and persists on reload', async () => {
    reply = await a(`/conversations/${id}/messages`, 'POST', request);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.visitorMessage.content, request.content);
    assert.ok(reply.body.message.content.length > 30);
    assert.ok((reply.body.message.content.match(/\?/g) ?? []).length <= 1);
    assert.equal(reply.body.brief.budget, '£9000');
    assert.equal(reply.body.brief.integrations, null);
    assert.equal(reply.body.brief.provenance.budget.status, 'manual');
    const reload = await a(`/conversations/${id}`);
    assert.equal(reload.body.messages.length, 3);
    assert.equal(reload.body.brief.budget, '£9000');
    assert.ok(reload.body.brief.objective, 'qualification must extract the explicit objective');
    assert.ok(Object.keys(reload.body.brief.provenance).length >= 3, 'qualification must add grounded details beyond manual edits');
  });
  await t.test('lost-response retry does not duplicate a completed turn', async () => {
    const again = await a(`/conversations/${id}/messages`, 'POST', request);
    assert.equal(again.status, 200); assert.equal(again.body.message.id, reply.body.message.id);
    assert.equal((await a(`/conversations/${id}`)).body.messages.length, 3);
    assert.equal((await a(`/conversations/${id}/messages`, 'POST', { ...request, content: 'Different content' })).status, 409);
  });
  await t.test('depth switch reaches actual provider without resetting answers', async () => {
    const pendingReply = a(`/conversations/${id}/messages`, 'POST', { requestId: crypto.randomUUID(), content: 'Compare a small custom portal with configuring an existing tool. Include dependencies and risks. Do not change our budget.', depth: 'deep_dive' });
    // A real edit racing the model call must win over the model's older snapshot.
    await new Promise(resolve => setTimeout(resolve, 500));
    const current = await a(`/conversations/${id}/brief`);
    const edit = await a(`/conversations/${id}/brief`, 'PATCH', { revision: current.body.revision, budget: '£10000' });
    assert.equal(edit.status, 200);
    const next = await pendingReply;
    assert.equal(next.status, 200, JSON.stringify(next.body));
    assert.equal(next.body.message.depth, 'deep_dive'); assert.equal(next.body.brief.budget, '£10000');
    assert.equal((await a(`/conversations/${id}`)).body.messages.length, 5);
    assert.ok(next.body.message.content.length > 200);
  });
  await t.test('replaying an older message cannot roll back a later manual correction', async () => {
    const replay = await a(`/conversations/${id}/messages`, 'POST', request);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.message.id, reply.body.message.id);
    assert.equal(replay.body.brief.budget, '£10000');
  });
});
