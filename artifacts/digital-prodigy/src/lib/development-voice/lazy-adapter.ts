import { SPECIALISTS, type ConsultationRuntime, type VoiceAdapter } from '@workspace/consultation';
import { createAudioPreparation } from './audio-preparation';

/** Keep the development transport, controller and diagnostics off text-first startup.
 * One cached delegate retains microphone retirement ownership across reopen attempts. */
export function createLazyAzureVoiceAdapter(runtime: Pick<ConsultationRuntime, 'messages'>): VoiceAdapter {
  let delegate: Promise<VoiceAdapter> | undefined;
  const audioPreparation = createAudioPreparation();
  return {
    available: import.meta.env?.VITE_SYNTRA_VOICE_PROVIDER === 'azure',
    specialists: SPECIALISTS.map(profile => profile.id),
    // This stays synchronous and small even while the transport chunk is loading.
    prepare: signal => audioPreparation.prepare(signal),
    async connect(id, emit, signal, options) {
      if (signal.aborted) throw new DOMException('Voice closed.', 'AbortError');
      delegate ??= import('./azure-voice').then(module => module.createAzureVoiceAdapter(runtime, { audioPreparation }));
      let adapter: VoiceAdapter;
      try { adapter = await delegate; }
      catch {
        delegate = undefined;
        throw new Error('Voice could not load. Reload the app and reconnect; your saved consultation is preserved.');
      }
      if (signal.aborted) throw new DOMException('Voice closed.', 'AbortError');
      return adapter.connect(id, emit, signal, options);
    },
  };
}
