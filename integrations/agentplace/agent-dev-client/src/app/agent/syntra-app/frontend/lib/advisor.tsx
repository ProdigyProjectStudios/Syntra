import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { observer } from 'mobx-react-lite';
import {
  useCreateConversation,
  useSendMessage,
  useGetConversation,
  getGetConversationQueryKey,
  getListConversationsQueryKey,
  getGetBriefQueryKey,
} from '../../compat/index';
import type { Conversation, ResponseDepth } from '../../compat/index';
import { AgentAuth } from '@/app/lib/agent-auth';

type Ctx = {
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  depth: ResponseDepth;
  setDepth: (d: ResponseDepth) => void;
  send: (content: string) => void;
  sending: boolean;
  pendingText: string | null;
  error: string | null;
  retry: () => void;
  steps: string[];
  conversation: Conversation | undefined;
  loadingConversation: boolean;
  ensureConversation: () => Promise<number>;
};

const AdvisorCtx = createContext<Ctx | null>(null);

export const AdvisorProvider = observer(function AdvisorProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [conversationId, setId] = useState<number | null>(1);
  const [depth, setDepthState] = useState<ResponseDepth>('detailed');
  const [pendingText, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const attempted = useRef<{ text: string; requestId: string } | null>(null);
  const depthTouchedScope = useRef<string | null>(null);
  const ensurePromise = useRef<{ scope: string; promise: Promise<number> } | null>(null);
  const sendInFlight = useRef(false);
  const sessionRef = useRef<{ scope: string; data: Conversation } | null>(null);

  const create = useCreateConversation();
  const sendMsg = useSendMessage();
  const createRef = useRef(create.mutateAsync);
  createRef.current = create.mutateAsync;
  const sendRef = useRef(sendMsg.mutateAsync);
  sendRef.current = sendMsg.mutateAsync;
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const nativeScope = AgentAuth.agentSessionId ?? 'unresolved';

  const convQ = useGetConversation(conversationId ?? 1, {
    query: { enabled: !!conversationId, queryKey: getGetConversationQueryKey(conversationId ?? 1), retry: 1 },
  });

  if (convQ.data) sessionRef.current = { scope: nativeScope, data: convQ.data };
  const refetchConversationRef = useRef(convQ.refetch);
  refetchConversationRef.current = convQ.refetch;

  useEffect(() => {
    if (convQ.data && depthTouchedScope.current !== nativeScope) {
      depthRef.current = convQ.data.depth;
      setDepthState(convQ.data.depth);
    }
  }, [convQ.data, nativeScope]);

  const setDepth = useCallback((next: ResponseDepth) => {
    depthTouchedScope.current = AgentAuth.agentSessionId ?? 'unresolved';
    depthRef.current = next;
    setDepthState(next);
  }, []);

  const setConversationId = useCallback((id: number | null) => {
    // A Syntra dashboard is bound to the current native Agentplace session. It cannot
    // create a second conversation inside that session or clear the durable transcript.
    setId(id ?? 1);
    setSteps([]);
    setError(null);
  }, []);

  const idRef = useRef(conversationId);
  idRef.current = conversationId;

  const ensureConversation = useCallback(() => {
    const scope = AgentAuth.agentSessionId ?? 'unresolved';
    if (ensurePromise.current?.scope === scope) return ensurePromise.current.promise;
    const pending = (async () => {
      let current = sessionRef.current?.scope === scope ? sessionRef.current.data : undefined;
      if (!current) {
        const result = await refetchConversationRef.current();
        current = result.data;
      }
      if (!current) throw new Error('The native Agentplace session could not be loaded.');

      if (depthTouchedScope.current !== scope) {
        depthRef.current = current.depth;
        setDepthState(current.depth);
      }
      const session = await createRef.current({ data: { depth: depthRef.current } });
      sessionRef.current = { scope, data: session };
      if (depthTouchedScope.current !== scope) {
        depthRef.current = session.depth;
        setDepthState(session.depth);
      }
      qc.setQueryData(getGetConversationQueryKey(session.id), session);
      idRef.current = session.id;
      setId(session.id);
      await qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      return session.id;
    })();
    ensurePromise.current = { scope, promise: pending };
    pending.then(
      () => { if (ensurePromise.current?.promise === pending) ensurePromise.current = null; },
      () => { if (ensurePromise.current?.promise === pending) ensurePromise.current = null; },
    );
    return pending;
  }, [qc]);

  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || sendInFlight.current) return;
      sendInFlight.current = true;
      const requestId = globalThis.crypto.randomUUID().replaceAll('-', '');
      attempted.current = { text, requestId };
      setError(null);
      setPending(text);
      setSteps([]);
      try {
        const id = await ensureConversation();
        const reply = await sendRef.current({
          id,
          data: { content: text, depth: depthRef.current, requestId },
        });
        setSteps(reply.suggestedNextSteps);
        qc.setQueryData(getGetBriefQueryKey(id), reply.brief);
        await Promise.all([
          qc.invalidateQueries({ queryKey: getGetConversationQueryKey(id) }),
          qc.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The response could not be confirmed. Check the transcript before retrying.');
      } finally {
        sendInFlight.current = false;
        setPending(null);
      }
    },
    [ensureConversation, qc],
  );

  const retry = useCallback(() => {
    if (attempted.current) {
      setError('The original request may already be in the native Agentplace session. Refresh the transcript and brief; do not resubmit it.');
    }
    void qc.invalidateQueries({ queryKey: getGetConversationQueryKey(idRef.current ?? 1) });
    void qc.invalidateQueries({ queryKey: getGetBriefQueryKey(idRef.current ?? 1) });
  }, [qc]);

  return (
    <AdvisorCtx.Provider
      value={{
        conversationId,
        setConversationId,
        depth,
        setDepth,
        send,
        sending: pendingText !== null,
        pendingText,
        error,
        retry,
        steps,
        conversation: convQ.data,
        loadingConversation: !!conversationId && convQ.isLoading,
        ensureConversation,
      }}
    >
      {children}
    </AdvisorCtx.Provider>
  );
});

export function useAdvisor() {
  const c = useContext(AdvisorCtx);
  if (!c) throw new Error('useAdvisor outside provider');
  return c;
}

export const DEPTHS: { id: ResponseDepth; label: string; hint: string }[] = [
  { id: 'concise', label: 'Concise', hint: 'Short, direct answers' },
  { id: 'detailed', label: 'Detailed', hint: 'Reasoning and options' },
  { id: 'deep_dive', label: 'Deep dive', hint: 'Full technical exploration' },
];

export const OPENING_STEPS = [
  'I have an idea to talk through',
  'Help me compare the service areas',
  'I want to improve a workflow',
];
