import { createContext, useContext, useMemo, useRef } from 'react';
import { reaction } from 'mobx';
import { ContentType, type AgentContent } from '@/lib/agent-library';
import { AgentAuth } from '@/app/lib/agent-auth';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { useVoiceToggle } from '@/app/lib/hooks/useVoiceToggle';
import { realtimeVoiceLevels } from '@/app/lib/services/voice-realtime.service';
import { trpc } from '@/app/lib/trpc';
import { createNativeRuntime } from '../shared/native-runtime';
import { NativeTranscript, nativeTranscriptPair, type NativeTranscriptPart } from '../shared/native-transcript';
import type { Depth, VoiceEvent } from '../shared/types';
import { SERVICE_AREAS } from './fixtures';
import { BLUEPRINT_VERSION_CONFLICT, BLUEPRINT_VERSION_CONFLICT_MESSAGE, BLUEPRINT_CHANGE_REJECTED, BLUEPRINT_CHANGE_REJECTED_PREFIX } from '../shared/blueprint-storage';
async function blueprintResult<T>(promise: Promise<T>): Promise<T> {
  try { return await promise; } catch (error) {
    if (error instanceof Error && error.message === BLUEPRINT_VERSION_CONFLICT_MESSAGE) throw Object.assign(new Error(error.message), { code: BLUEPRINT_VERSION_CONFLICT });
    if (error instanceof Error && error.message.startsWith(BLUEPRINT_CHANGE_REJECTED_PREFIX)) throw Object.assign(new Error(error.message), { code: BLUEPRINT_CHANGE_REJECTED });
    throw error;
  }
}

/** Host-supplied stable IDs/timestamps: the export did not include the AgentContent definition. */
export interface TranscriptIdentity {
  identify(item: AgentContent, index: number): { key: string; responseId: string; createdAt: string };
}
const IdentityContext = createContext<TranscriptIdentity | null>(null);
export const SyntraNativeIdentityProvider = IdentityContext.Provider;
export function useAgentPlaceRuntime() {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error('Register SyntraNativeIdentityProvider with the real native content IDs and timestamps.');
  const store = useMessagingStore();
  const toggleVoice = useVoiceToggle();
  const toggle = useRef(toggleVoice);
  toggle.current = toggleVoice;
  const scope = AgentAuth.agentSessionId;
  return useMemo(() => {
    if (!scope) throw new Error('A trusted native AgentPlace session is required.');
    const transcript = new NativeTranscript();
    const read = (depth: Depth, turns: Array<{ responseId: string; depth: Depth }> = []) => {
      const parts: NativeTranscriptPart[] = store.contents.flatMap((item, index) => {
        if (item.hidden || (item.role !== 'user' && item.role !== 'assistant')) return [];
        const role = item.role === 'user' ? 'visitor' as const : 'advisor' as const;
        if (item.type === ContentType.Text) {
          if (item.isReasoning || !item.content.trim() || item.content === '[user opened the agent]') return [];
          return [{ ...identity.identify(item, index), role, kind: 'text', text: item.content }];
        }
        if (item.type === ContentType.Audio && item.content.text?.trim()) {
          return [{ ...identity.identify(item, index), role, kind: 'audio', text: item.content.text }];
        }
        return [];
      });
      return transcript.read(parts, depth, turns);
    };
    return createNativeRuntime({
      scope,
      currentScope: () => AgentAuth.agentSessionId ?? '',
      sessions: {
        list: () => trpc.syntra.listSessions.query(),
        get: async id => {
          const snapshot = await trpc.syntra.getSession.query({ id });
          return { ...snapshot, messages: read(snapshot.depth, snapshot.turns).map(p => p.message) };
        },
        // createSession in the old export is ensureSession, NOT a real new-session action.
        setDepth: (id, depth) => trpc.syntra.setDepth.mutate({ id, depth }).then(() => {}),
      },
      briefs: {
        get: id => trpc.syntra.getBrief.query({ id }),
        update: (id, changes, revision) => trpc.syntra.updateBrief.mutate({ id, changes, revision }),
      },
      blueprints: {
        get: id => trpc.syntra.getBlueprint.query({ id }),
        update: (id, input) => blueprintResult(trpc.syntra.updateBlueprint.mutate({ id, ...input })),
        regenerate: (id, input) => blueprintResult(trpc.syntra.regenerateBlueprint.mutate({ id, ...input })),
      },
      turns: {
        begin: (id, input) => trpc.syntra.beginTurn.mutate({ id, ...input }),
        attach: (requestId, responseId) => trpc.syntra.attachResponseId.mutate({ requestId, responseId }).then(() => {}),
        complete: (requestId, responseId) => trpc.syntra.completeTurn.mutate({ requestId, responseId }).then(result => result.brief),
      },
      messaging: {
        busy: () => store.userRequestPending || store.voiceRunBusy,
        send: async (content, metadata, admitted) => {
          await store.sendMessage({ instruction: content, metadata, onAdmitted: receipt => admitted(receipt.responseId) });
        },
        pair: (responseId, depth) => nativeTranscriptPair(read(depth), responseId),
      },
      services: async () => SERVICE_AREAS,
      booking: { contacts: () => trpc.syntra.contacts.query() },
      voice: {
        available: true,
        async connect(_id, emit, signal) {
          let closed = false;
          let owned = false;
          let activated = store.speechEnabled;
          let frame = 0;
          const disposers: Array<() => void> = [];
          const send = (event: VoiceEvent) => { if (!closed && !signal.aborted) emit(event); };
          const close = () => {
            if (closed) return;
            closed = true; cancelAnimationFrame(frame);
            disposers.forEach(dispose => dispose());
            signal.removeEventListener('abort', close);
            // StageVoice remains the owner if voice was already running when Syntra opened.
            if (owned && store.speechEnabled) toggle.current();
          };
          if (signal.aborted) throw new Error('Voice connection canceled.');
          signal.addEventListener('abort', close, { once: true });
          try {
            disposers.push(reaction(() => [store.voiceState, store.speechEnabled] as const, ([state, enabled]) => {
              if (enabled) activated = true;
              send({ type: 'state', state: !enabled && activated && state === 'idle' ? 'closed'
                : state === 'connecting' || state === 'idle' ? 'connecting'
                : state === 'thinking' || state === 'building' ? 'thinking'
                : state === 'speaking' ? 'speaking' : 'listening' });
            }, { fireImmediately: true }));
            disposers.push(reaction(() => store.voiceCaption || store.lastVoiceText, text => {
              if (text.trim()) send({ type: 'transcript', role: store.voiceState === 'speaking' ? 'advisor' : 'visitor', text, final: false });
            }));
            disposers.push(reaction(() => [store.contents.length, store.voiceRunBusy, store.userRequestPending] as const, () => {
              if (!store.voiceRunBusy && !store.userRequestPending) send({ type: 'conversation-updated' });
            }));
            const level = () => {
              send({ type: 'amplitude', value: Math.min(1, Math.max(0, realtimeVoiceLevels.input, realtimeVoiceLevels.output) * 4) });
              if (!closed) frame = requestAnimationFrame(level);
            };
            if (!store.speechEnabled) { owned = true; toggle.current(); }
            frame = requestAnimationFrame(level);
            return { close };
          } catch (error) { close(); throw error; }
        },
      },
    });
  }, [scope, store, identity]);
}
