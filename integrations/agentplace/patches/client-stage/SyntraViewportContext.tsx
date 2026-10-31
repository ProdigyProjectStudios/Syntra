import { createContext, useContext } from 'react';

export interface SyntraViewportControl {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
}

const SyntraViewportContext = createContext<SyntraViewportControl | null>(null);
export const SyntraViewportProvider = SyntraViewportContext.Provider;
export function useSyntraViewport() {
  return useContext(SyntraViewportContext);
}
