import type { TurnInput } from '@workspace/consultation';

export interface PendingTextTurn extends TurnInput { id: number; previousMessageIds: number[] }
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export class TextTurnRecoveryError extends Error {}
const failure = () => new TextTurnRecoveryError('This tab could not preserve the original request for safe retry. No new message was sent.');

/** Tab-scoped recovery only. A successful owned conversation read is still required
 * before displaying this content; browser storage is never session authority. */
export function createPendingTextTurnStore(scope: string, storage: () => StoragePort = () => sessionStorage) {
  const key = (id: number) => `syntra.text.pending.v1:${encodeURIComponent(scope)}:${id}`;
  const decode = (raw: string, id: number): PendingTextTurn => {
    try {
      const value = JSON.parse(raw) as Partial<PendingTextTurn> | null;
      if (!value || value.id !== id || !Number.isSafeInteger(id) || id < 1 ||
          typeof value.content !== 'string' || !value.content.trim() || value.content.length > 12000 ||
          typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value.requestId) ||
          !['concise', 'detailed', 'deep_dive'].includes(value.depth ?? '') ||
          (value.specialist !== undefined && !['syntra', 'technical', 'automation'].includes(value.specialist)) ||
          !Array.isArray(value.previousMessageIds) || value.previousMessageIds.length > 241 ||
          !value.previousMessageIds.every(value => Number.isSafeInteger(value) && value > 0)) throw failure();
      return { id, content: value.content, depth: value.depth!, requestId: value.requestId,
        previousMessageIds: value.previousMessageIds, ...(value.specialist ? { specialist: value.specialist } : {}) };
    } catch { throw failure(); }
  };
  const load = (id: number): PendingTextTurn | null => {
    try { const raw = storage().getItem(key(id)); return raw ? decode(raw, id) : null; }
    catch { throw failure(); }
  };
  return {
    load,
    save(attempt: PendingTextTurn) {
      try {
        const serialized = JSON.stringify(decode(JSON.stringify(attempt), attempt.id));
        const previous = load(attempt.id);
        if (previous && (previous.requestId !== attempt.requestId || previous.content !== attempt.content ||
            previous.depth !== attempt.depth || previous.specialist !== attempt.specialist)) {
          throw new TextTurnRecoveryError('Recover the earlier message before starting another request in this consultation.');
        }
        storage().setItem(key(attempt.id), serialized);
        if (load(attempt.id)?.requestId !== attempt.requestId) throw failure();
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Recover the earlier')) throw error;
        throw failure();
      }
    },
    clear(id: number, requestId: string) {
      try { if (load(id)?.requestId === requestId) {
        storage().removeItem(key(id));
        if (load(id)?.requestId === requestId) throw failure();
      } }
      catch { throw new TextTurnRecoveryError('The response is saved, but this tab could not clear its retry record. Retry to recover the saved response.'); }
    },
  };
}
