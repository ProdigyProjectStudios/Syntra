import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ConsultationRuntime } from '@workspace/consultation';

type RuntimeContext = {
  runtime: ConsultationRuntime;
  scope: string;
  initialConversationId?: number;
  /** Native hosts own session creation; omitting this never clears their transcript. */
  native?: boolean;
};
const Context = createContext<RuntimeContext | null>(null);
export function SyntraRuntimeProvider({ children, ...value }: RuntimeContext & { children: ReactNode }) {
  return <Context.Provider key={value.scope} value={value}>{children}</Context.Provider>;
}
export function useRuntime() {
  const value = useContext(Context);
  if (!value) throw new Error('Syntra requires a configured runtime provider.');
  return value;
}
export function useRuntimeKeys() {
  const { scope } = useRuntime();
  return useMemo(() => ({
    getGetConversationQueryKey: (id: number) => ['syntra', scope, 'conversation', id] as const,
    getGetBriefQueryKey: (id: number) => ['syntra', scope, 'brief', id] as const,
    getGetBlueprintQueryKey: (id: number) => ['syntra', scope, 'blueprint', id] as const,
    getListConversationsQueryKey: () => ['syntra', scope, 'sessions'] as const,
    getListServicesQueryKey: () => ['syntra', scope, 'services'] as const,
    getListContactOptionsQueryKey: () => ['syntra', scope, 'contacts'] as const,
  }), [scope]);
}
