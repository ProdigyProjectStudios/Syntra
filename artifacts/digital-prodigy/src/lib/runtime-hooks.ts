import { useMutation, useQuery } from '@tanstack/react-query';
import { getGetBriefQueryKey, getListServicesQueryKey, getListContactOptionsQueryKey, getListConversationsQueryKey } from '@workspace/api-client-react';
import type { BriefFields } from '@workspace/consultation';
import { runtime } from './runtime';

export function useListServices() {
  return useQuery({ queryKey: getListServicesQueryKey(), queryFn: () => runtime.services(), staleTime: 60000 });
}
export function useListContactOptions() {
  return useQuery({ queryKey: getListContactOptionsQueryKey(), queryFn: () => runtime.booking.contacts(), staleTime: 60000 });
}
export function useListConversations() {
  return useQuery({ queryKey: getListConversationsQueryKey(), queryFn: () => runtime.sessions.list(), refetchOnWindowFocus: true });
}
export function useGetBrief(id: number) {
  return useQuery({ queryKey: getGetBriefQueryKey(id), queryFn: ({ signal }) => runtime.briefs.get(id, signal), enabled: id > 0, refetchOnWindowFocus: true, refetchInterval: 15000 });
}
export function useUpdateBrief() {
  return useMutation({ mutationFn: ({ id, data: { revision, ...changes } }: { id: number; data: Partial<BriefFields> & { revision: number } }) => runtime.briefs.update(id, changes, revision) });
}
