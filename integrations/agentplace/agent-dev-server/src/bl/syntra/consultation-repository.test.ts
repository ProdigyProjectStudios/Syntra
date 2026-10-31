import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { AgentStorage } from '../agent/agent-library.ts';
import { ConsultationError } from './consultation-engine.ts';
import { SyntraConsultationRepository } from './consultation-repository.ts';
import { inProcessNativeGate } from './shared/native-repository.ts';

class MemoryStorage {
  readonly files = new Map<string, Buffer>();

  async readFile(path: string): Promise<Buffer> {
    const file = this.files.get(path);
    if (!file) {
      const error = new Error('file not found');
      error.name = 'StorageFileNotFoundError';
      throw error;
    }
    return Buffer.from(file);
  }

  async writeFile(path: string, content: Buffer): Promise<void> {
    this.files.set(path, Buffer.from(content));
  }
}

function repository(storage: MemoryStorage, sessionKey: string) {
  return new SyntraConsultationRepository(storage as unknown as AgentStorage, sessionKey, inProcessNativeGate);
}

describe('SyntraConsultationRepository', () => {
  it('keeps the brief inside the current native session', async () => {
    const first = repository(new MemoryStorage(), 'session-a');
    const second = repository(new MemoryStorage(), 'session-b');
    await first.ensureSession('detailed');
    await first.updateBrief(1, { objective: 'One session only' }, 0);

    assert.equal((await first.get(1)).brief.objective, 'One session only');
    assert.equal((await second.get(1)).brief.objective, null);
  });

  it('stages a typed turn, preserves intervening edits, and commits idempotently', async () => {
    const repo = repository(new MemoryStorage(), 'session-typed');
    await repo.ensureSession('concise');
    const content = 'I want a client portal for four customers';
    const requestId = 'request_12345';
    const responseId = 'response_12345';

    const admission = await repo.beginTurn(1, requestId, content, 'concise');
    assert.equal(admission.status, 'reserved');
    await repo.attachResponseId(requestId, responseId);
    const staged = await repo.stageBriefChanges(requestId, {
      objective: {
        value: 'Client portal for four customers',
        status: 'confirmed',
        evidence: content,
      },
    });
    assert.deepEqual(staged.stagedFields, ['objective']);
    assert.equal(staged.depth, 'concise');

    const edited = await repo.updateBrief(1, { objective: 'Start with customer onboarding' }, 0);
    assert.equal(edited.provenance.objective?.status, 'manual');
    const committed = await repo.completeTurn(requestId, responseId, 'A portal could start with onboarding.');
    const repeated = await repo.completeTurn(requestId, responseId, 'A portal could start with onboarding.');

    assert.equal(committed.objective, 'Start with customer onboarding');
    assert.equal(repeated.revision, committed.revision);
    assert.equal((await repo.get(1)).messageCount, 2);
  });

  it('restores brief provenance and response depth from the same native-session storage', async () => {
    const storage = new MemoryStorage();
    const first = repository(storage, 'session-restart');
    await first.ensureSession('detailed');
    const content = 'I want a staff portal';
    const requestId = 'request_restart_1';
    const responseId = 'response_restart_1';

    await first.beginTurn(1, requestId, content, 'deep_dive');
    await first.attachResponseId(requestId, responseId);
    await first.stageBriefChanges(requestId, {
      objective: { value: 'Staff portal', status: 'confirmed', evidence: content },
    });
    const committed = await first.completeTurn(requestId, responseId, 'A staff portal is a clear starting point.');
    const edited = await first.updateBrief(1, { requirements: 'Staff approval required' }, committed.revision);

    const reopened = repository(storage, 'session-restart');
    const snapshot = await reopened.get(1);
    assert.equal(snapshot.depth, 'deep_dive');
    assert.equal(snapshot.brief.objective, 'Staff portal');
    assert.equal(snapshot.brief.provenance.objective?.status, 'confirmed');
    assert.equal(snapshot.brief.requirements, 'Staff approval required');
    assert.equal(snapshot.brief.provenance.requirements?.status, 'manual');
    assert.equal(snapshot.brief.revision, edited.revision);
    assert.equal(snapshot.messageCount, 2);
  });

  it('admits one concurrent request, supports replay, and rejects request-ID reuse', async () => {
    const repo = repository(new MemoryStorage(), 'session-dedupe');
    await repo.ensureSession('detailed');
    const requestId = 'dedupe_request_1';
    const content = 'I need a booking workflow';
    const admissions = await Promise.all([
      repo.beginTurn(1, requestId, content, 'concise'),
      repo.beginTurn(1, requestId, content, 'concise'),
      repo.beginTurn(1, requestId, content, 'concise'),
    ]);
    assert.deepEqual(admissions.map((entry) => entry.status), ['reserved', 'pending', 'pending']);

    const responseId = 'dedupe_response_1';
    await repo.attachResponseId(requestId, responseId);
    await repo.completeTurn(requestId, responseId, 'Start by mapping the booking workflow.');
    const replay = await repo.beginTurn(1, requestId, content, 'concise');
    assert.deepEqual(replay, { status: 'completed', responseId });
    await assert.rejects(
      () => repo.beginTurn(1, requestId, 'A different request', 'concise'),
      (error: unknown) => error instanceof ConsultationError && error.status === 409,
    );
    await assert.rejects(
      () => repo.beginTurn(1, requestId, content, 'deep_dive'),
      (error: unknown) => error instanceof ConsultationError && error.status === 409,
    );
  });

  it('records native voice brief updates once and returns the persisted depth', async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage, 'session-voice');
    await repo.ensureSession('deep_dive');
    const transcript = 'I need a client portal';
    const changes = {
      service: {
        value: 'Client portal',
        status: 'confirmed' as const,
        evidence: transcript,
      },
    };
    const staged = await repo.stageNativeVoiceChanges('voice-turn-1', transcript, changes);
    const first = await repo.completeNativeVoiceTurn('voice-turn-1');
    const reopened = repository(storage, 'session-voice');
    const repeated = await reopened.completeNativeVoiceTurn('voice-turn-1');

    assert.equal(first.service, 'Client portal');
    assert.equal(staged.depth, 'deep_dive');
    assert.equal(repeated.revision, first.revision);
    assert.deepEqual((await reopened.get(1)).brief.provenance.service, {
      status: 'confirmed', evidence: transcript,
    });
  });
});
