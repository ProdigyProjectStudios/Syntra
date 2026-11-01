import {
  listConversations, createConversation, getConversation, sendMessage, getBrief, updateBrief,
  listServices, listContactOptions,
  getBlueprint, updateBlueprint, regenerateBlueprint,
} from '@workspace/api-client-react';
import type { ConsultationRuntime } from '@workspace/consultation';
import { createLazyAzureVoiceAdapter } from './development-voice/lazy-adapter';

/** Supply this before the React entry point to use native AgentPlace sessions, messages and voice. */
declare global {
  interface Window { __SYNTRA_RUNTIME__?: ConsultationRuntime }
}

export const replitRuntime: ConsultationRuntime = {
  sessions: {
    list: () => listConversations(),
    create: depth => createConversation({ depth }),
    get: (id, signal) => getConversation(id, { signal }),
  },
  messages: { send: (id, input) => sendMessage(id, input) },
  briefs: {
    get: (id, signal) => getBrief(id, { signal }),
    update: (id, changes, revision) => updateBrief(id, { ...changes, revision }),
  },
  blueprints: {
    get: (id, signal) => getBlueprint(id, { signal }),
    update: (id, input) => updateBlueprint(id, input),
    regenerate: (id, input) => regenerateBlueprint(id, input),
  },
  services: () => listServices(),
  booking: { contacts: () => listContactOptions() },
  voice: {
    available: false,
    async connect() { throw new Error('Realtime voice is not connected here. AgentPlace must provide its native voice adapter.'); },
  },
};
replitRuntime.voice = createLazyAzureVoiceAdapter(replitRuntime);
export const runtime: ConsultationRuntime = window.__SYNTRA_RUNTIME__ ?? replitRuntime;

export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return fallback;
}
