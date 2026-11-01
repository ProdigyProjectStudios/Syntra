import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation, Depth, TurnInput } from '@workspace/consultation';
import { errorMessage } from './errors';
import { useRuntime, useRuntimeKeys } from './runtime-context';
import { createPendingTextTurnStore, TextTurnRecoveryError } from './pending-text-turn';

const KEY = 'dp.activeConversation';
const DEPTH_KEY = 'dp.depth';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
type Attempt = TurnInput & { id: number | null; previousMessageIds?: number[] };
type Ctx = {
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  depth: Depth; setDepth: (depth: Depth) => void;
  send: (content: string) => void; sending: boolean; pendingText: string | null;
  error: string | null; retry: () => void; steps: string[];
  conversation: Conversation | undefined; loadingConversation: boolean;
  ensureConversation: () => Promise<number>;
  ensureVoiceConversation: () => Promise<number>;
};
const AdvisorCtx = createContext<Ctx | null>(null);
export function AdvisorProvider({ children }: { children: ReactNode }) {
  const { runtime, scope, initialConversationId, native } = useRuntime();
  const { getGetConversationQueryKey, getListConversationsQueryKey, getGetBriefQueryKey } = useRuntimeKeys();
  const sessionKey = scope === 'replit' ? KEY : `${KEY}:${scope}`;
  const depthKey = scope === 'replit' ? DEPTH_KEY : `${DEPTH_KEY}:${scope}`;
  const saveSession = useCallback((id: number | null) => {
    try { if (id) localStorage.setItem(sessionKey, String(id)); else localStorage.removeItem(sessionKey); } catch { /* in-memory session */ }
  }, [sessionKey]);
  const qc = useQueryClient();
  const recovery = useMemo(() => createPendingTextTurnStore(scope), [scope]);
  const [conversationId, setId] = useState<number | null>(() => initialConversationId ?? (Number(read(sessionKey)) > 0 ? Number(read(sessionKey)) : null));
  const [depth, updateDepth] = useState<Depth>(() => { const d = read(depthKey); return d === 'concise' || d === 'deep_dive' ? d : 'detailed'; });
  const [pending, setPending] = useState<Attempt | null>(null);
  const [failure, setFailure] = useState<{ id: number | null; message: string } | null>(null);
  const [steps, setSteps] = useState<{ id: number; values: string[] } | null>(null);
  const lastAttempt = useRef<Attempt | null>(null);
  const active = useRef(conversationId); active.current = conversationId;
  const depthRef = useRef(depth); depthRef.current = depth;
  const busy = useRef(false);
  const depthTouched = useRef(false);
  const depthRestored = useRef(false);
  const depthSaveGeneration = useRef(0);
  const creating = useRef<Promise<number> | null>(null);
  const recoveryChecked = useRef<number | null>(null);

  const convQ = useQuery({
    queryKey: getGetConversationQueryKey(conversationId ?? 0),
    queryFn: ({ signal }) => runtime.sessions.get(conversationId!, signal),
    enabled: !!conversationId, retry: 1, refetchOnWindowFocus: true,
    refetchInterval: busy.current ? false : 15000,
  });
  useEffect(() => {
    // Never reveal tab-stored text until the owning runtime confirms this conversation.
    if (!convQ.isFetchedAfterMount || convQ.isFetching || convQ.isError || !convQ.data || convQ.data.id !== conversationId || busy.current || recoveryChecked.current === conversationId) return;
    recoveryChecked.current = conversationId;
    try {
      const restored = recovery.load(conversationId!);
      if (restored && !lastAttempt.current) {
        lastAttempt.current = restored;
        setFailure({ id: conversationId, message: 'An earlier message may still be finishing. Retry to recover its original request without sending it twice.' });
      }
    } catch (error) {
      setFailure({ id: conversationId, message: error instanceof Error ? error.message : 'The original request could not be recovered.' });
    }
  }, [convQ.data, convQ.isFetchedAfterMount, convQ.isFetching, convQ.isError, conversationId, recovery]);
  const setDepth = useCallback((d: Depth) => {
    depthTouched.current = true;
    updateDepth(d); depthRef.current = d;
    try { localStorage.setItem(depthKey, d); } catch { /* in-memory preference */ }
    const id = active.current;
    const generation = ++depthSaveGeneration.current;
    if (id && runtime.sessions.setDepth) void runtime.sessions.setDepth(id, d).catch(() => {
      if (active.current !== id || depthSaveGeneration.current !== generation) return;
      setFailure({ id, message: 'The native depth preference could not be saved. Retry before starting voice.' });
    });
  }, [depthKey, runtime]);
  useEffect(() => {
    if (!native || depthRestored.current || !convQ.data) return;
    depthRestored.current = true;
    if (!depthTouched.current) {
      updateDepth(convQ.data.depth); depthRef.current = convQ.data.depth;
      try { localStorage.setItem(depthKey, convQ.data.depth); } catch { /* in-memory preference */ }
    }
  }, [native, convQ.data, depthKey]);
  const setConversationId = useCallback((id: number | null) => {
    // One active send at a time; do not create cross-session pending state.
    if (busy.current) return;
    if (native && id === null) {
      setFailure({ id: active.current, message: 'Use Agent controls to start a new native session. Your current transcript is preserved.' });
      return;
    }
    depthSaveGeneration.current++;
    active.current = id; recoveryChecked.current = null; setId(id); setFailure(null); setSteps(null); lastAttempt.current = null; saveSession(id);
  }, [native, saveSession]);
  // Old numeric localStorage IDs are not authority. Never claim unowned legacy records.
  useEffect(() => {
    if (convQ.error && 'status' in convQ.error && convQ.error.status === 404 && !busy.current) {
      qc.removeQueries({ queryKey: getGetConversationQueryKey(conversationId ?? 0) });
      setConversationId(null);
    }
  }, [convQ.error, conversationId, qc, setConversationId]);
  const ensureConversation = useCallback(async (): Promise<number> => {
    if (active.current) return active.current;
    if (creating.current) return creating.current;
    creating.current = (async () => {
      const conv = await runtime.sessions.create(depthRef.current);
      qc.setQueryData(getGetConversationQueryKey(conv.id), conv);
      qc.setQueryData(getGetBriefQueryKey(conv.id), conv.brief);
      active.current = conv.id; setId(conv.id); saveSession(conv.id);
      void qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      return conv.id;
    })();
    try { return await creating.current; } finally { creating.current = null; }
  }, [qc, runtime, saveSession, getGetConversationQueryKey, getGetBriefQueryKey, getListConversationsQueryKey]);
  const ensureVoiceConversation = useCallback(async (): Promise<number> => {
    const id = await ensureConversation();
    if (busy.current || lastAttempt.current?.id === id || recovery.load(id)) {
      throw new Error('Recover the pending text message in Discover before starting voice. Its original request is preserved.');
    }
    return id;
  }, [ensureConversation, recovery]);
  const perform = useCallback(async (attempt: Attempt) => {
    if (busy.current) return;
    busy.current = true; setPending(attempt); setFailure(null); setSteps(null);
    try {
      const id = attempt.id ?? await ensureConversation();
      attempt = { ...attempt, id, previousMessageIds: attempt.previousMessageIds ??
        qc.getQueryData<Conversation>(getGetConversationQueryKey(id))?.messages.map(message => message.id) ?? [] };
      lastAttempt.current = attempt; setPending(attempt);
      await qc.cancelQueries({ queryKey: getGetConversationQueryKey(id) });
      // Save before admission, including original depth/specialist. A storage failure
      // cannot silently turn a reload into a different model request.
      recovery.save({ ...attempt, id, previousMessageIds: attempt.previousMessageIds ?? [] });
      const { content, depth, requestId, specialist } = attempt;
      const reply = await runtime.messages.send(id, { content, depth, requestId, ...(specialist ? { specialist } : {}) });
      qc.setQueryData<Conversation>(getGetConversationQueryKey(id), prev => {
        if (!prev) return prev;
        const ids = new Set(prev.messages.map(m => m.id));
        return { ...prev, depth: attempt.depth, brief: reply.brief, messages: [...prev.messages, ...[reply.visitorMessage, reply.message].filter(m => !ids.has(m.id))] };
      });
      qc.setQueryData(getGetBriefQueryKey(id), reply.brief);
      recovery.clear(id, attempt.requestId);
      setSteps({ id, values: reply.suggestedNextSteps }); lastAttempt.current = null;
      void qc.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    } catch (error) {
      lastAttempt.current = attempt;
      setFailure({ id: attempt.id, message: errorMessage(error, error instanceof TextTurnRecoveryError ? error.message : 'The advisor could not reply. Your message is kept here; retry when ready.') });
    } finally { busy.current = false; setPending(null); }
  }, [ensureConversation, qc, runtime, recovery, getGetConversationQueryKey, getGetBriefQueryKey, getListConversationsQueryKey]);
  const send = useCallback((content: string) => {
    if (!content.trim() || busy.current) return;
    if (lastAttempt.current?.id === active.current) {
      setFailure({ id: active.current, message: 'Retry the earlier message first. Its original words and response depth are preserved.' });
      return;
    }
    if (active.current) {
      try {
        const restored = recovery.load(active.current);
        if (restored) {
          // Keep the current view private until its ownership read has succeeded.
          if (convQ.isFetchedAfterMount && !convQ.isError && convQ.data?.id === active.current) lastAttempt.current = restored;
          setFailure({ id: active.current, message: 'An earlier request needs recovery. Retry after this consultation loads.' });
          return;
        }
      } catch (error) {
        setFailure({ id: active.current, message: error instanceof Error ? error.message : 'Safe retry storage is unavailable.' });
        return;
      }
    }
    void perform({ id: active.current, content: content.trim(), depth: depthRef.current, requestId: crypto.randomUUID() });
  }, [perform, recovery, convQ.data, convQ.isFetchedAfterMount, convQ.isError]);
  const retry = useCallback(() => {
    if (lastAttempt.current) {
      if (lastAttempt.current.id !== null && (lastAttempt.current.id !== active.current || convQ.isError)) {
        void convQ.refetch(); return;
      }
      void perform(lastAttempt.current); return;
    }
    if (active.current && convQ.isFetchedAfterMount && !convQ.isError && convQ.data?.id === active.current) {
      try {
        const restored = recovery.load(active.current);
        if (restored) { lastAttempt.current = restored; void perform(restored); return; }
      } catch (error) {
        setFailure({ id: active.current, message: error instanceof TextTurnRecoveryError ? error.message : 'Safe retry storage is unavailable.' });
        return;
      }
    }
    recoveryChecked.current = null;
    void convQ.refetch();
  }, [perform, recovery, convQ.refetch, convQ.data, convQ.isFetchedAfterMount, convQ.isError]);
  const visibleAttempt = pending ?? (failure && lastAttempt.current);
  const alreadyInTranscript = visibleAttempt && convQ.data?.messages.some(message =>
    message.role === 'visitor' && message.content === visibleAttempt.content &&
    !visibleAttempt.previousMessageIds?.includes(message.id));
  const pendingText = visibleAttempt && !alreadyInTranscript &&
    (visibleAttempt.id === null || visibleAttempt.id === conversationId) ? visibleAttempt.content : null;
  return (
    <AdvisorCtx.Provider value={{
      conversationId, setConversationId, depth, setDepth, send, retry,
      sending: pending !== null, pendingText,
      error: failure?.message ?? (convQ.isError ? 'This conversation could not load. Retry without starting over.' : null),
      steps: steps?.id === conversationId ? steps.values : [],
      conversation: convQ.data, loadingConversation: !!conversationId && convQ.isLoading, ensureConversation, ensureVoiceConversation,
    }}>{children}</AdvisorCtx.Provider>
  );
}
export function useAdvisor() {
  const ctx = useContext(AdvisorCtx);
  if (!ctx) throw new Error('useAdvisor must be used inside AdvisorProvider');
  return ctx;
}
export const DEPTHS: { id: Depth; label: string; hint: string }[] = [
  { id: 'concise', label: 'Concise', hint: 'Short, direct answers' },
  { id: 'detailed', label: 'Detailed', hint: 'Reasoning and options' },
  { id: 'deep_dive', label: 'Deep dive', hint: 'Full technical exploration' },
];
export const OPENING_STEPS = [
  'I have an idea to talk through',
  'Help me compare the service areas',
  'I want to improve a workflow',
];
