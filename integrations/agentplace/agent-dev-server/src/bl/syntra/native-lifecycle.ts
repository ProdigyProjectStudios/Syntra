import type { AgentStorageFactoryService } from '../../services/agent-storage-factory.service.ts';
import type { NativeTurnVerifier } from '../../trpc/routers/syntra.router.ts';
import { verifyNativeCompletion } from './shared/native-completion.ts';
import { SyntraConsultationRepository } from './consultation-repository.ts';

export interface NativeLifecycleEvidence extends NativeTurnVerifier {
  /** True only after trusted native evidence proves terminal failure/cancel/not-admitted. */
  canDiscard(sessionKey: string, requestId: string, voice: boolean): Promise<boolean>;
  voiceCompleted(sessionKey: string, turnId: string): Promise<{
    sessionKey: string; turnId: string; status: 'succeeded' | 'running' | 'failed' | 'canceled'; visitorText: string;
  } | null>;
}
/** Register these callbacks with existing native lifecycle events, not a new transport. */
export function createSyntraLifecycle(storage: AgentStorageFactoryService, native: NativeLifecycleEvidence) {
  const repository = (session: string) => new SyntraConsultationRepository(storage.getStorage(session), session, native.runExclusive);
  return {
    async typedSucceeded(session: string, requestId: string, responseId: string) {
      const proof = verifyNativeCompletion(await native.completed(session, requestId, responseId), session, requestId, responseId);
      const repo = repository(session);
      await repo.attachResponseId(requestId, responseId);
      return repo.completeTurn(requestId, responseId, proof.reply, proof.visitorText);
    },
    async voiceSucceeded(session: string, turnId: string) {
      const proof = await native.voiceCompleted(session, turnId);
      if (!proof || proof.sessionKey !== session || proof.turnId !== turnId || proof.status !== 'succeeded') {
        throw new Error('Native voice completion could not be verified.');
      }
      return repository(session).completeNativeVoiceTurn(turnId, proof.visitorText);
    },
    async terminalFailure(session: string, requestId: string, voice = false) {
      if (!await native.canDiscard(session, requestId, voice)) throw new Error('Uncertain native admission must not be released.');
      await repository(session).discardTurn(requestId, voice);
    },
  };
}
