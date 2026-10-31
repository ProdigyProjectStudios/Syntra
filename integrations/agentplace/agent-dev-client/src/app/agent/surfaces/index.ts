import type { FC } from 'react';
import type { A2uiNodeViewProps } from '@/app/lib/a2ui/catalog.tsx';

import { SyntraDashboard } from './SyntraIntegrationProof';

export const AGENT_SURFACE_COMPONENTS: Record<string, FC<A2uiNodeViewProps>> = {
  SyntraDashboard,
};
