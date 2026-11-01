import { useMutation } from '@tanstack/react-query';
import type {
  OpportunityInput, OpportunityAnalysis, EvidenceInput, EvidenceAnalysis, ActionInput, ActionPlan,
} from '@workspace/api-client-react';

export type { OpportunityAnalysis };
export interface SyntraIntelligenceAdapter {
  opportunity(input: OpportunityInput): Promise<OpportunityAnalysis>;
  evidence(input: EvidenceInput): Promise<EvidenceAnalysis>;
  action(input: ActionInput): Promise<ActionPlan>;
}
declare global {
  interface Window { __SYNTRA_INTELLIGENCE__?: SyntraIntelligenceAdapter }
}

// The native transfer explicitly changes this flag, never calling a Replit URL
// from AgentPlace when the host has not registered its own typed tool adapter.
const NATIVE_ONLY = false;
const endpoints = { opportunity: 'opportunity/analyze', evidence: 'evidence/analyze', action: 'action/plan' };
export async function requestIntelligence<K extends keyof SyntraIntelligenceAdapter>(
  tool: K, input: Parameters<SyntraIntelligenceAdapter[K]>[0],
): Promise<Awaited<ReturnType<SyntraIntelligenceAdapter[K]>>> {
  type Result = Awaited<ReturnType<SyntraIntelligenceAdapter[K]>>;
  const adapter = window.__SYNTRA_INTELLIGENCE__;
  if (adapter) {
    const invoke = adapter[tool] as (input: Parameters<SyntraIntelligenceAdapter[K]>[0]) => Promise<Result>;
    return invoke(input);
  }
  if (NATIVE_ONLY) throw new Error('The native host has not connected this intelligence tool.');
  const response = await fetch(`${import.meta.env.BASE_URL}api/${endpoints[tool]}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'The analysis could not complete. Please try again.');
  return payload as Result;
}
export function useAnalyzeOpportunity() {
  return useMutation({ mutationFn: ({ data }: { data: OpportunityInput }) => requestIntelligence('opportunity', data) });
}
