import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, RotateCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { useVoiceToggle } from '@/app/lib/hooks/useVoiceToggle';
import { realtimeVoiceLevels } from '@/app/lib/services/voice-realtime.service';
import { useAdvisor } from '../lib/advisor';
import { cn } from '../lib/utils';
import { NeuralCore, type CoreState } from './neural-core';

/** Any surface can open voice mode by dispatching this window event. */
export const OPEN_VOICE_EVENT = 'dp:open-voice';

function SpokenLine({ text }: { text: string }) {
  return (
    <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-balance text-xl font-light leading-snug tracking-tight text-foreground/90 sm:text-[26px]">
      {text}
    </p>
  );
}

export const VoiceConsole = observer(function VoiceConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ensureConversation } = useAdvisor();
  const store = useMessagingStore();
  const toggleVoice = useVoiceToggle();
  const [boot, setBoot] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const amplitude = useRef(0);
  const consoleOwnsVoice = useRef(false);
  const toggleVoiceRef = useRef(toggleVoice);
  toggleVoiceRef.current = toggleVoice;
  const [size, setSize] = useState(640);

  useEffect(() => {
    if (!open) {
      if (consoleOwnsVoice.current) {
        consoleOwnsVoice.current = false;
        if (store.speechEnabled) toggleVoice();
      }
      setBooting(false);
      return;
    }
    let active = true;
    setBoot(null);
    setBooting(true);
    void ensureConversation()
      .then(() => {
        if (!active) return;
        if (!store.speechEnabled) {
          consoleOwnsVoice.current = true;
          toggleVoice();
        }
        setBooting(false);
      })
      .catch(() => {
        if (active) {
          setBoot('Could not open the native Agentplace session.');
          setBooting(false);
        }
      });
    return () => { active = false; };
  }, [open, ensureConversation, store, toggleVoice]);

  useEffect(() => {
    const f = () => setSize(Math.round(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.56, 560)));
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !store.speechEnabled) {
      amplitude.current = 0;
      return;
    }
    let raf = 0;
    const read = () => {
      // Read live levels from Agentplace's existing microphone and playback session.
      amplitude.current = Math.min(1, Math.max(realtimeVoiceLevels.input, realtimeVoiceLevels.output) * 4);
      raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [open, store.speechEnabled]);

  // StageVoice owns the engine. Only stop it on unmount if this console started it.
  useEffect(() => () => {
    if (consoleOwnsVoice.current && store.speechEnabled) toggleVoiceRef.current();
  }, [store]);

  const failed = !!boot || (open && !booting && !store.speechEnabled && store.voiceState === 'idle');
  const state: CoreState = failed ? 'error' : booting || !store.speechEnabled || store.voiceState === 'connecting' || store.voiceState === 'idle'
    ? 'connecting'
    : store.voiceState === 'speaking' || store.voiceState === 'thinking' || store.voiceState === 'building'
      ? 'speaking'
      : 'idle';
  const label = failed ? 'Offline' : state === 'connecting' ? 'Connecting' : state === 'speaking'
    ? store.voiceState === 'speaking' ? 'Speaking' : 'Working'
    : store.voiceState === 'listening' ? 'Listening' : 'Ready';
  const caption = store.voiceCaption.trim() || (store.voiceState === 'speaking' ? store.lastVoiceText.trim() : '');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          role="dialog" aria-label="Voice console"
        >
          <div className="absolute inset-0 bg-[#04030B]" onClick={onClose} />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 50% 45%, rgba(29,78,216,.16), rgba(34,211,238,.05) 40%, transparent 70%)' }} />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,.75))' }} />

          <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-white/45">
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn('absolute inset-0 rounded-full', state === 'error' ? 'bg-rose-400' : 'bg-primary', state !== 'error' && 'animate-ping opacity-60')} />
                <span className={cn('relative h-1.5 w-1.5 rounded-full', state === 'error' ? 'bg-rose-400' : 'bg-primary')} />
              </span>
              <span>Prodigy</span><span className="text-white/20">/</span>
              <span className="rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-1 text-[8px] tracking-[0.16em] text-primary/80">Agentplace voice</span>
              <AnimatePresence mode="wait">
                <motion.span key={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className={state === 'error' ? 'text-rose-300/80' : 'text-primary/80'}>{label}</motion.span>
              </AnimatePresence>
            </div>
            <button onClick={onClose} aria-label="Close voice console" data-testid="button-close-voice" className="grid h-10 w-10 place-items-center rounded-full text-white/40 transition hover:bg-white/[0.04] hover:text-white">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.06, opacity: 0, filter: 'blur(12px)' }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} className="pointer-events-none relative z-[5] -mt-10">
            <NeuralCore state={state} amplitude={amplitude} size={size} />
          </motion.div>

          <div className="relative z-10 -mt-6 flex h-24 w-full max-w-2xl items-start justify-center px-6 text-center">
            <AnimatePresence mode="wait">
              <motion.div key={caption || state} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.35 } }}>
                {caption ? <SpokenLine text={caption} /> : (
                  <p className={cn('font-mono text-[11px] uppercase tracking-[0.45em]', state === 'error' ? 'text-rose-300/70' : 'text-white/35')}>
                    {boot ?? (state === 'connecting' ? 'Connecting to the advisor' : state === 'error' ? 'Voice channel unavailable' : store.voiceState === 'thinking' || store.voiceState === 'building' ? 'Working on your request' : store.voiceState === 'listening' ? 'Go ahead, I am listening' : 'Voice is ready')}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="absolute bottom-8 left-0 right-0 z-10 flex items-center justify-center gap-3">
            {failed && <button onClick={() => { setBoot(null); setBooting(false); if (!store.speechEnabled) { consoleOwnsVoice.current = true; toggleVoice(); } }} data-testid="button-retry-voice" className="flex items-center gap-2 rounded-full border border-primary/30 px-5 py-2.5 text-sm text-primary transition hover:bg-primary/10"><RotateCw className="h-4 w-4" strokeWidth={1.5} /> Reconnect</button>}
            <button onClick={onClose} data-testid="button-end-voice" className="group flex items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-5 py-2.5 text-[13px] text-white/50 backdrop-blur transition hover:border-rose-400/30 hover:text-rose-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70 transition group-hover:bg-rose-400" /> End conversation
            </button>
          </div>
          <div className="absolute bottom-3 left-0 right-0 z-10 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-white/20" data-testid="status-voice-session">{store.voiceEngine} / {store.voiceState}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
