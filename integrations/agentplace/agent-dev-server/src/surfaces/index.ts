import type { ComponentContract } from '../../vendor/agentplace-a2ui/contract-schema.ts';

import { SYNTRA_DASHBOARD } from './syntra-integration-proof.ts';

export const AGENT_SURFACE_CONTRACTS: Record<string, ComponentContract> = {
  [SYNTRA_DASHBOARD.component]: SYNTRA_DASHBOARD,
};
