import { useMutation, useQuery } from '@tanstack/react-query';
import type { BriefFields } from '@workspace/consultation';
import { useRuntime, useRuntimeKeys } from './runtime-context';

export function useListServices() {
  const { runtime } = useRuntime();
  const { getListServicesQueryKey } = useRuntimeKeys();
  return useQuery({ queryKey: getListServicesQueryKey(), queryFn: () => runtime.services(), staleTime: 60000 });
}
export function useListContactOptions() {
  const { runtime } = useRuntime();
  const { getListContactOptionsQueryKey } = useRuntimeKeys();
  return useQuery({ queryKey: getListContactOptionsQueryKey(), queryFn: () => runtime.booking.contacts(), staleTime: 60000 });
}
export function useListConversations() {
  const { runtime } = useRuntime();
  const { getListConversationsQueryKey } = useRuntimeKeys();
  return useQuery({ queryKey: getListConversationsQueryKey(), queryFn: () => runtime.sessions.list(), refetchOnWindowFocus: true });
}
export function useGetBrief(id: number) {
  const { runtime } = useRuntime();
  const { getGetBriefQueryKey } = useRuntimeKeys();
  return useQuery({ queryKey: getGetBriefQueryKey(id), queryFn: ({ signal }) => runtime.briefs.get(id, signal), enabled: id > 0, refetchOnWindowFocus: true, refetchInterval: 15000 });
}
export function useUpdateBrief() {
  const { runtime } = useRuntime();
  return useMutation({ mutationFn: ({ id, data: { revision, ...changes } }: { id: number; data: Partial<BriefFields> & { revision: number } }) => runtime.briefs.update(id, changes, revision) });
}
