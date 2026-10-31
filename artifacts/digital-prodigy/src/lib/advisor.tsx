import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetConversationQueryKey, getListConversationsQueryKey, getGetBriefQueryKey } from '@workspace/api-client-react';
import type { Conversation, Depth, TurnInput } from '@workspace/consultation';
import { runtime, errorMessage } from './runtime';

const KEY = 'dp.activeConversation';
const DEPTH_KEY = 'dp.depth';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (id: number | null) => { try { if (id) localStorage.setItem(KEY, String(id)); else localStorage.removeItem(KEY); } catch { /* browser storage may be disabled; session still works in memory */ } };
type Attempt = TurnInput & { id: number | null };
type Ctx = {
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  depth: Depth; setDepth: (depth: Depth) => void;
  send: (content: string) => void; sending: boolean; pendingText: string | null;
  error: string | null; retry: () => void; steps: string[];
  conversation: Conversation | undefined; loadingConversation: boolean;
  ensureConversation: () => Promise<number>;
};
const AdvisorCtx = createContext<Ctx | null>(null);
export function AdvisorProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [conversationId, setId] = useState<number | null>(() => Number(read(KEY)) > 0 ? Number(read(KEY)) : null);
  const [depth, updateDepth] = useState<Depth>(() => { const d = read(DEPTH_KEY); return d === 'concise' || d === 'deep_dive' ? d : 'detailed'; });
  const [pending, setPending] = useState<Attempt | null>(null);
  const [failure, setFailure] = useState<{ id: number | null; message: string } | null>(null);
  const [steps, setSteps] = useState<{ id: number; values: string[] } | null>(null);
  const lastAttempt = useRef<Attempt | null>(null);
  const active = useRef(conversationId); active.current = conversationId;
  const depthRef = useRef(depth); depthRef.current = depth;
  const busy = useRef(false);
  const creating = useRef<Promise<number> | null>(null);

  const convQ = useQuery({
    queryKey: getGetConversationQueryKey(conversationId ?? 0),
    queryFn: ({ signal }) => runtime.sessions.get(conversationId!, signal),
    enabled: !!conversationId, retry: 1, refetchOnWindowFocus: true,
    refetchInterval: busy.current ? false : 15000,
  });
  const setDepth = useCallback((d: Depth) => {
    updateDepth(d); depthRef.current = d;
    try { localStorage.setItem(DEPTH_KEY, d); } catch { /* in-memory preference */ }
  }, []);
  const setConversationId = useCallback((id: number | null) => {
    // One active send at a time; do not create cross-session pending state.
    if (busy.current) return;
    active.current = id; setId(id); setFailure(null); setSteps(null); lastAttempt.current = null; remember(id);
  }, []);
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
      active.current = conv.id; setId(conv.id); remember(conv.id);
      void qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      return conv.id;
    })();
    try { return await creating.current; } finally { creating.current = null; }
  }, [qc]);
  const perform = useCallback(async (attempt: Attempt) => {
    if (busy.current) return;
    busy.current = true; setPending(attempt); setFailure(null); setSteps(null);
    try {
      const id = attempt.id ?? await ensureConversation();
      attempt = { ...attempt, id }; lastAttempt.current = attempt; setPending(attempt);
      await qc.cancelQueries({ queryKey: getGetConversationQueryKey(id) });
      const reply = await runtime.messages.send(id, attempt);
      qc.setQueryData<Conversation>(getGetConversationQueryKey(id), prev => {
        if (!prev) return prev;
        const ids = new Set(prev.messages.map(m => m.id));
        return { ...prev, depth: attempt.depth, brief: reply.brief, messages: [...prev.messages, ...[reply.visitorMessage, reply.message].filter(m => !ids.has(m.id))] };
      });
      qc.setQueryData(getGetBriefQueryKey(id), reply.brief);
      setSteps({ id, values: reply.suggestedNextSteps }); lastAttempt.current = null;
      void qc.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    } catch (error) {
      lastAttempt.current = attempt;
      setFailure({ id: attempt.id, message: errorMessage(error, 'The advisor could not reply. Your message is kept here; retry when ready.') });
    } finally { busy.current = false; setPending(null); }
  }, [ensureConversation, qc]);
  const send = useCallback((content: string) => {
    if (!content.trim() || busy.current) return;
    void perform({ id: active.current, content: content.trim(), depth: depthRef.current, requestId: crypto.randomUUID() });
  }, [perform]);
  const retry = useCallback(() => {
    if (lastAttempt.current) void perform(lastAttempt.current);
    else void convQ.refetch();
  }, [perform, convQ.refetch]);
  const visibleAttempt = pending ?? (failure && lastAttempt.current);
  const pendingText = visibleAttempt && (visibleAttempt.id === null || visibleAttempt.id === conversationId) ? visibleAttempt.content : null;
  return (
    <AdvisorCtx.Provider value={{
      conversationId, setConversationId, depth, setDepth, send, retry,
      sending: pending !== null, pendingText,
      error: failure?.message ?? (convQ.isError ? 'This conversation could not load. Retry without starting over.' : null),
      steps: steps?.id === conversationId ? steps.values : [],
      conversation: convQ.data, loadingConversation: !!conversationId && convQ.isLoading, ensureConversation,
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
