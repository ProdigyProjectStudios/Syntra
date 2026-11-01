import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateConversationResponse, GetConversationResponse, SendMessageResponse, GetBlueprintResponse } from '../../../lib/api-zod/src/generated/api.ts';
import { blankBrief, emptyBlueprint, evolveBlueprint, manualBrief, normalizeStoredBlueprint } from '@workspace/consultation';

const time = '2026-11-01T00:00:00.000Z';
const visitor = { id: 2, role: 'visitor', content: 'Plan a client approval portal.', depth: 'detailed', createdAt: time };
const advisor = { ...visitor, id: 3, role: 'advisor', content: 'Start with a focused review workflow.' };
const conversation = (blueprint = emptyBlueprint()) => ({ id: 1, title: 'Synthetic project', depth: 'detailed', createdAt: time,
  updatedAt: time, messages: [advisor], brief: blankBrief(), blueprint });

test('HTTP schemas accept version-zero Blueprints before any generation without inventing an updated timestamp', () => {
  for (const schema of [CreateConversationResponse, GetConversationResponse]) {
    const { blueprint: _document, ...legacy } = conversation();
    assert.equal(schema.safeParse(legacy).success, true, 'Historical sessions may omit the new document');
    const value = JSON.parse(JSON.stringify(schema.parse(conversation())));
    assert.equal(value.blueprint.version, 0);
    assert.equal(value.blueprint.updatedAt, '');
    assert.deepEqual(normalizeStoredBlueprint(value.blueprint), emptyBlueprint());
  }
  assert.deepEqual(GetBlueprintResponse.parse(emptyBlueprint()), emptyBlueprint());
  const reply = SendMessageResponse.parse({ visitorMessage: visitor, message: advisor, brief: blankBrief(),
    suggestedNextSteps: [], specialist: 'syntra', blueprint: emptyBlueprint() });
  assert.equal(JSON.parse(JSON.stringify(reply)).blueprint.version, 0);
});

test('generated HTTP schemas preserve a complete evolving Blueprint and bounded history through JSON serialization', () => {
  const brief = manualBrief(blankBrief(), { objective: 'Reduce client approval delays', integrations: 'Existing project tracker' }, 0);
  const blueprint = evolveBlueprint(undefined, brief, [], { visitorHistory: [], latest: '', source: 'brief', now: time });
  const value = JSON.parse(JSON.stringify(GetConversationResponse.parse({ ...conversation(blueprint), brief })));
  assert.deepEqual(normalizeStoredBlueprint(value.blueprint), blueprint);
  assert.ok(value.blueprint.sections.architecture.length > 0);
  assert.ok(value.blueprint.history[0].changes.length > 0);
});
