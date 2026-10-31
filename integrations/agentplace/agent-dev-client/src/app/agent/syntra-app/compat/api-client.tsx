import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { ContentType, type AgentContent } from '@/lib/agent-library';
import { AgentAuth } from '@/app/lib/agent-auth';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { trpc } from '@/app/lib/trpc';
import { SERVICE_AREAS } from './fixtures';
import type {
  AdvisorReply,
  Brief,
  BriefUpdate,
  ContactOption,
  Conversation,
  ConversationSummary,
  Message,
  MessageInput,
  ResponseDepth,
  ServiceArea,
} from './types';

export const getListServicesQueryKey = () => ['syntra', 'services'] as const;
export const getListContactOptionsQueryKey = () => ['syntra', 'contactOptions'] as const;
const nativeSessionScope = () => AgentAuth.agentSessionId ?? 'unresolved';
export const getListConversationsQueryKey = () => ['syntra', nativeSessionScope(), 'sessions'] as const;
export const getGetConversationQueryKey = (id: number) => ['syntra', nativeSessionScope(), 'session', id] as const;
export const getGetBriefQueryKey = (id: number) => ['syntra', nativeSessionScope(), 'brief', id] as const;

type QueryArgs<T> = {
  query?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryFn'>;
};

function isText(item: AgentContent): item is Extract<AgentContent, { type: typeof ContentType.Text }> {
  return item.type === ContentType.Text;
}

function messageText(item: AgentContent): string | null {
  if (item.hidden || item.role !== 'user' && item.type === ContentType.Audio) return null;
  if (isText(item)) {
    if (item.isReasoning || item.content === '[user opened the agent]') return null;
    return item.content.trim() || null;
  }
  if (item.type === ContentType.Audio && item.role === 'user') {
    return item.content.text?.trim() || null;
  }
  return null;
}

function asNativeMessages(
  contents: AgentContent[],
  depth: ResponseDepth,
  createdAt: string,
  turns: Conversation['turns'] = [],
): Message[] {
  const turnDepth = new Map(turns.map((turn) => [turn.responseId, turn.depth]));
  return contents.flatMap((item, index) => {
    const content = messageText(item);
    if (!content) return [];
    return [{
      id: index + 1,
      role: item.role === 'user' ? 'visitor' as const : 'advisor' as const,
      content,
      depth: item.responseId ? turnDepth.get(item.responseId) ?? depth : depth,
      createdAt,
    }];
  });
}

function responseText(contents: AgentContent[], responseId: string): string {
  return contents
    .filter((item) => item.responseId === responseId && item.type === ContentType.Text &&
      item.role !== 'user' && !item.isReasoning && !item.hidden)
    .map((item) => item.type === ContentType.Text ? item.content.trim() : '')
    .filter(Boolean)
    .join('\n\n');
}

export function useListServices() {
  return useQuery({
    queryKey: getListServicesQueryKey(),
    queryFn: async (): Promise<ServiceArea[]> => SERVICE_AREAS,
  });
}

export function useListContactOptions() {
  return useQuery({
    queryKey: getListContactOptionsQueryKey(),
    queryFn: async (): Promise<ContactOption[]> => trpc.syntra.contacts.query(),
  });
}

export function useListConversations() {
  return useQuery({
    queryKey: getListConversationsQueryKey(),
    queryFn: async (): Promise<ConversationSummary[]> => trpc.syntra.listSessions.query(),
  });
}

export function useGetConversation(id: number, options?: QueryArgs<Conversation>) {
  const store = useMessagingStore();
  const query = useQuery({
    queryKey: getGetConversationQueryKey(id),
    queryFn: async (): Promise<Conversation> => {
      const snapshot = await trpc.syntra.getSession.query({ id });
      return {
        ...snapshot,
        messages: asNativeMessages(store.contents, snapshot.depth, snapshot.updatedAt, snapshot.turns),
      };
    },
    ...options?.query,
  });
  const data = query.data
    ? {
        ...query.data,
        messages: asNativeMessages(store.contents, query.data.depth, query.data.updatedAt, query.data.turns),
      }
    : undefined;
  return { ...query, data };
}

export function useGetBrief(id: number, options?: QueryArgs<Brief>) {
  return useQuery({
    queryKey: getGetBriefQueryKey(id),
    queryFn: async (): Promise<Brief> => trpc.syntra.getBrief.query({ id }),
    ...options?.query,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { depth: ResponseDepth } }): Promise<Conversation> => {
      const snapshot = await trpc.syntra.createSession.mutate({ depth: data.depth });
      return { ...snapshot, messages: [] };
    },
    onSuccess: async (session) => {
      queryClient.setQueryData(getGetConversationQueryKey(session.id), session);
      await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    },
  });
}

export function useSendMessage() {
  const store = useMessagingStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: MessageInput }): Promise<AdvisorReply> => {
      if (store.userRequestPending || store.voiceRunBusy) {
        throw new Error('The current Agentplace response is still in progress. Wait for it to finish before sending another message.');
      }

      const admission = await trpc.syntra.beginTurn.mutate({
        id,
        requestId: data.requestId,
        content: data.content,
        depth: data.depth,
      });

      if (admission.status === 'completed') {
        throw new Error('This message was already handled in the Agentplace session. Refresh the transcript before sending anything again.');
      }
      if (admission.responseId) {
        const existing = responseText(store.contents, admission.responseId);
        if (existing) {
          const completed = await trpc.syntra.completeTurn.mutate({
            requestId: data.requestId,
            responseId: admission.responseId,
            reply: existing,
          });
          const message: Message = {
            id: Date.now(), role: 'advisor', content: existing, depth: data.depth, createdAt: new Date().toISOString(),
          };
          queryClient.setQueryData(getGetBriefQueryKey(id), completed.brief);
          return { message, brief: completed.brief, suggestedNextSteps: [] };
        }
        throw new Error('This request may still be running in Agentplace. Check the transcript before sending it again.');
      }

      let responseId = '';
      let attachPromise: Promise<unknown> | undefined;
      await store.sendMessage({
        instruction: data.content,
        metadata: { syntraDepth: data.depth, syntraRequestId: data.requestId },
        onAdmitted: (receipt) => {
          responseId = receipt.responseId;
          attachPromise = trpc.syntra.attachResponseId.mutate({
            requestId: data.requestId,
            responseId: receipt.responseId,
          });
        },
      });
      if (attachPromise) await attachPromise;
      if (!responseId) {
        throw new Error('Agentplace did not confirm that the response started. Check the transcript before retrying.');
      }

      const replyText = responseText(store.contents, responseId);
      if (!replyText) {
        throw new Error('The Agentplace response is still settling. Check the transcript before retrying.');
      }
      const completed = await trpc.syntra.completeTurn.mutate({
        requestId: data.requestId,
        responseId,
        reply: replyText,
      });
      const message: Message = {
        id: Date.now(), role: 'advisor', content: replyText, depth: data.depth, createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(getGetBriefQueryKey(id), completed.brief);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
      ]);
      return { message, brief: completed.brief, suggestedNextSteps: [] };
    },
  });
}

export function useUpdateBrief() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      revision,
    }: { id: number; data: BriefUpdate; revision: number }): Promise<Brief> =>
      trpc.syntra.updateBrief.mutate({ id, changes: data, revision }),
    onSuccess: async (brief, { id }) => {
      queryClient.setQueryData(getGetBriefQueryKey(id), brief);
      await queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
    },
  });
}
