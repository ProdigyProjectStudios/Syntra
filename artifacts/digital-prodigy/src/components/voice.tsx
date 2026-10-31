import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, RotateCw } from 'lucide-react';
import { useCreateVoiceSession } from '@workspace/api-client-react';
import { useAdvisor } from '@/lib/advisor';
import { cn } from '@/lib/utils';

import { NeuralCore, type CoreState } from '@/components/neural-core';

/** Simulated speech envelope: ~4 syllables/s grouped into words and phrases. Replace with live audio RMS later. */
function useSimulatedVoice(active: boolean, amplitude: MutableRefObject<number>) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!active) {
      amplitude.current = 0;
      setSpeaking(false);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const cycle = t % 8.5; // ~5.2s speaking, then listening
      const on = cycle > 1.2 && cycle < 6.4;
      setSpeaking((p) => (p !== on ? on : p));
      if (on) {
        const syl = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 4.1 + Math.sin(t * 1.7) * 2.2), 1.5);
        const word = Math.min(1, Math.max(0, (Math.sin(t * Math.PI * 2 * 0.85 + Math.sin(t * 0.6)) + 0.55) * 1.6));
        const phrase = 0.62 + 0.38 * Math.sin(t * 0.9);
        const edge = Math.min(1, (cycle - 1.2) * 3, (6.4 - cycle) * 3);
        amplitude.current = Math.min(1, (0.12 + syl * 0.88) * word * phrase * edge);
      } else amplitude.current = 0;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, amplitude]);
  return speaking;
}

/** Any surface can open voice mode by dispatching this window event. */
export const OPEN_VOICE_EVENT = 'dp:open-voice';

const LINES = [
  'Channel open. I can hear the shape of your idea.',
  'Tell me who it is for, and what changes for them.',
  'I will keep the brief updated as we talk.',
];

function SpokenLine({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <p className="text-balance text-xl font-light leading-snug tracking-tight text-foreground/90 sm:text-[26px]">
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 6, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.15 + i * 0.16, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {w}{i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </p>
  );
}

export function VoiceConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ensureConversation } = useAdvisor();
  const voice = useCreateVoiceSession();
  const mutateRef = useRef(voice.mutate);
  mutateRef.current = voice.mutate;
  const resetRef = useRef(voice.reset);
  resetRef.current = voice.reset;
  const [boot, setBoot] = useState<string | null>(null);
  const amplitude = useRef(0);
  const [line, setLine] = useState(-1);
  const [size, setSize] = useState(640);

  const provision = async () => {
    setBoot(null);
    resetRef.current();
    try {
      const id = await ensureConversation();
      mutateRef.current({ data: { conversationId: id } });
    } catch {
      setBoot('Could not open a conversation for voice.');
    }
  };

  useEffect(() => {
    if (open) { setLine(-1); provision(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const session = voice.data;
  const failed = voice.isError || !!boot;
  const speaking = useSimulatedVoice(open && !!session && !failed, amplitude);

  useEffect(() => {
    if (speaking) setLine((l) => (l + 1) % LINES.length);
  }, [speaking]);

  const state: CoreState = failed ? 'error' : !session ? 'connecting' : speaking ? 'speaking' : 'idle';
  const label = { connecting: 'Waking', idle: 'Listening', speaking: 'Speaking', error: 'Offline' }[state];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-label="Voice console"
        >
          {/* deep space */}
          <div className="absolute inset-0 bg-[#04030B]" onClick={onClose} />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 50% 45%, rgba(29,78,216,.16), rgba(34,211,238,.05) 40%, transparent 70%)' }} />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,.75))' }} />

          {/* top bar */}
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-white/45">
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn('absolute inset-0 rounded-full', state === 'error' ? 'bg-rose-400' : 'bg-primary', state !== 'error' && 'animate-ping opacity-60')} />
                <span className={cn('relative h-1.5 w-1.5 rounded-full', state === 'error' ? 'bg-rose-400' : 'bg-primary')} />
              </span>
              <span>Prodigy</span>
              <span className="text-white/20">/</span>
              <AnimatePresence mode="wait">
                <motion.span key={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className={state === 'error' ? 'text-rose-300/80' : 'text-primary/80'}>{label}</motion.span>
              </AnimatePresence>
            </div>
            <button onClick={onClose} aria-label="Close voice console" data-testid="button-close-voice" className="grid h-10 w-10 place-items-center rounded-full text-white/40 transition hover:bg-white/[0.04] hover:text-white">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* the intelligence */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.06, opacity: 0, filter: 'blur(12px)' }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none relative z-[5] -mt-10"
          >
            <NeuralCore state={state} amplitude={amplitude} size={size} />
          </motion.div>

          {/* spoken words */}
          <div className="relative z-10 -mt-6 flex h-24 w-full max-w-2xl items-start justify-center px-6 text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={state === 'speaking' ? `l${line}` : state}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.5 } }}
              >
                {state === 'speaking' && line >= 0 ? (
                  <SpokenLine text={LINES[line]} />
                ) : (
                  <p className={cn('font-mono text-[11px] uppercase tracking-[0.45em]', state === 'error' ? 'text-rose-300/70' : 'text-white/35')}>
                    {state === 'connecting' ? 'Waking the advisor' : state === 'error' ? (boot ?? 'Voice channel unavailable') : 'Go ahead, I am listening'}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* controls */}
          <div className="absolute bottom-8 left-0 right-0 z-10 flex items-center justify-center gap-3">
            {failed && (
              <button onClick={provision} data-testid="button-retry-voice" className="flex items-center gap-2 rounded-full border border-primary/30 px-5 py-2.5 text-sm text-primary transition hover:bg-primary/10">
                <RotateCw className="h-4 w-4" strokeWidth={1.5} /> Reconnect
              </button>
            )}
            <button onClick={onClose} data-testid="button-end-voice" className="group flex items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-5 py-2.5 text-[13px] text-white/50 backdrop-blur transition hover:border-rose-400/30 hover:text-rose-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70 transition group-hover:bg-rose-400" /> End conversation
            </button>
          </div>
          {session && (
            <div className="absolute bottom-3 left-0 right-0 z-10 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-white/20" data-testid="status-voice-session">
              {session.status} / {session.transport}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
