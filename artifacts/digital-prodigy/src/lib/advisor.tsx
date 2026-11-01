import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateConversation,
  useSendMessage,
  useGetConversation,
  getGetConversationQueryKey,
  getListConversationsQueryKey,
  getGetBriefQueryKey,
} from '@workspace/api-client-react';
import type { Conversation, ResponseDepth } from '@workspace/api-client-react';

const KEY = 'dp.activeConversation';

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

export function AdvisorProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [conversationId, setId] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 ? v : null;
  });
  const [depth, setDepth] = useState<ResponseDepth>('detailed');
  const [pendingText, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const lastAttempt = useRef<string>('');

  const create = useCreateConversation();
  const sendMsg = useSendMessage();
  const createRef = useRef(create.mutateAsync);
  createRef.current = create.mutateAsync;
  const sendRef = useRef(sendMsg.mutateAsync);
  sendRef.current = sendMsg.mutateAsync;
  const depthRef = useRef(depth);
  depthRef.current = depth;

  const convQ = useGetConversation(conversationId ?? 0, {
    query: { enabled: !!conversationId, queryKey: getGetConversationQueryKey(conversationId ?? 0), retry: 1 },
  });

  useEffect(() => {
    if (conversationId && convQ.isError && (convQ.error as { status?: number })?.status === 404) {
      setId(null);
      localStorage.removeItem(KEY);
    }
  }, [conversationId, convQ.isError, convQ.error]);

  const setConversationId = useCallback((id: number | null) => {
    setId(id);
    setSteps([]);
    setError(null);
    if (id) localStorage.setItem(KEY, String(id));
    else localStorage.removeItem(KEY);
  }, []);

  const idRef = useRef(conversationId);
  idRef.current = conversationId;

  const ensureConversation = useCallback(async () => {
    if (idRef.current) return idRef.current;
    const conv = await createRef.current({ data: { depth: depthRef.current } });
    qc.setQueryData(getGetConversationQueryKey(conv.id), conv);
    idRef.current = conv.id;
    setId(conv.id);
    localStorage.setItem(KEY, String(conv.id));
    qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    return conv.id;
  }, [qc]);

  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text) return;
      lastAttempt.current = text;
      setError(null);
      setPending(text);
      setSteps([]);
      try {
        const id = await ensureConversation();
        const reply = await sendRef.current({ id, data: { content: text, depth: depthRef.current } });
        setSteps(reply.suggestedNextSteps);
        qc.setQueryData(getGetBriefQueryKey(id), reply.brief);
        // write both turns into the thread immediately so the visitor's message never drops out
        // between the pending bubble clearing and the server refetch landing
        qc.setQueryData<Conversation>(getGetConversationQueryKey(id), (prev) =>
          prev
            ? {
                ...prev,
                messages: [
                  ...prev.messages,
                  { id: -Date.now(), role: 'visitor', content: text, depth: reply.message.depth, createdAt: reply.message.createdAt },
                  reply.message,
                ],
              }
            : prev,
        );
        qc.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      } catch {
        setError('The advisor lost the thread for a moment.');
      } finally {
        setPending(null);
      }
    },
    [ensureConversation, qc],
  );

  const retry = useCallback(() => {
    if (lastAttempt.current) send(lastAttempt.current);
  }, [send]);

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
}

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
