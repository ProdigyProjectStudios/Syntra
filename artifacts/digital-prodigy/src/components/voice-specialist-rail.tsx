import { useRef, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SPECIALISTS, getSpecialistProfile, type SpecialistId } from '@workspace/consultation';
import { NeuralCore, type CoreState } from '@/components/neural-core';
import { cn } from '@/lib/utils';

export const SPECIALIST_VISUALS: Record<SpecialistId, { hue: number; color: string; orbit: number; period: number }> = {
  syntra: { hue: 0, color: '#67e8f9', orbit: -28, period: 28 },
  technical: { hue: 38, color: '#8aafff', orbit: 34, period: 38 },
  automation: { hue: 82, color: '#b9a2ff', orbit: -54, period: 22 },
};

function SpecialistOrb({ id, active, state, amplitude }: {
  id: SpecialistId; active: boolean; state: CoreState; amplitude: MutableRefObject<number>;
}) {
  const reduceMotion = useReducedMotion();
  const quiet = useRef(0);
  const visual = SPECIALIST_VISUALS[id];
  return (
    <div className="relative h-10 w-10 shrink-0" aria-hidden>
      <motion.span className="absolute inset-1.5 rounded-full border border-transparent"
        style={{ borderTopColor: `${visual.color}80`, borderBottomColor: `${visual.color}20` }}
        animate={reduceMotion ? undefined : { rotate: id === 'technical' ? -360 : 360 }}
        transition={{ duration: visual.period, repeat: Infinity, ease: 'linear' }} />
      <span className="absolute inset-x-0.5 top-[12px] h-[16px] rounded-[50%] border"
        style={{ transform: `rotate(${visual.orbit}deg)`, borderColor: `${visual.color}${active ? '40' : '20'}` }} />
      <div className="absolute -inset-1" style={{ filter: `hue-rotate(${visual.hue}deg)` }}>
        <NeuralCore size={48} nodes={48} bloom={false} still={Boolean(reduceMotion)}
          state={active ? state : 'idle'} amplitude={active ? amplitude : quiet} />
      </div>
      {active && <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full" style={{ background: visual.color, boxShadow: `0 0 8px ${visual.color}` }} />}
    </div>
  );
}

export function VoiceSpecialistRail({ active, onSelect, supported, lockedReason, switching, compact, preview, state, amplitude }: {
  active: SpecialistId;
  onSelect: (id: SpecialistId) => void;
  supported: readonly SpecialistId[];
  lockedReason?: string;
  switching: boolean;
  compact: boolean;
  preview: boolean;
  state: CoreState;
  amplitude: MutableRefObject<number>;
}) {
  const [hovered, setHovered] = useState<SpecialistId | null>(null);
  const [focused, setFocused] = useState<SpecialistId | null>(null);
  const reduceMotion = useReducedMotion();
  const buttons = useRef(new Map<SpecialistId, HTMLButtonElement>());
  const candidate = hovered ?? focused;
  const hoverProfile = candidate ? getSpecialistProfile(candidate) : null;
  const reason = (id: SpecialistId) => !supported.includes(id)
    ? 'This specialist is not available in the current voice session.'
    : id !== active ? lockedReason : undefined;
  const choose = (id: SpecialistId) => {
    if (id === active || reason(id) || switching) return;
    onSelect(id);
  };

  return (
    <aside className="pointer-events-none relative flex justify-center"
      aria-label="Voice specialists" data-testid="voice-specialist-rail">
      <div className="pointer-events-auto relative flex items-center gap-0.5 rounded-full border border-white/[.05] bg-[#060914]/80 p-1 shadow-[0_10px_50px_-24px_rgba(34,211,238,.25)] backdrop-blur-xl"
        role="group" aria-label="Choose a voice specialist">
        {SPECIALISTS.map((profile, index) => {
          const selected = profile.id === active;
          const disabledReason = reason(profile.id);
          const unavailable = !supported.includes(profile.id);
          return (
            <button key={profile.id} ref={element => { if (element) buttons.current.set(profile.id, element); else buttons.current.delete(profile.id); }}
              type="button" aria-pressed={selected} aria-disabled={Boolean(disabledReason || switching)}
              aria-label={`${profile.name}, ${profile.title}${selected ? ', selected' : ''}${disabledReason ? `. ${disabledReason}` : ''}${preview ? '. Preview only; voice is not connected.' : ''}`}
              aria-describedby={`voice-specialist-desc-${profile.id}`}
              onClick={() => choose(profile.id)}
              onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(profile.id); }}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setFocused(profile.id)} onBlur={() => setFocused(null)}
              onKeyDown={event => {
                const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
                if (direction) { event.preventDefault(); buttons.current.get(SPECIALISTS[(index + direction + SPECIALISTS.length) % SPECIALISTS.length].id)?.focus(); }
                else if (event.key === 'Escape' && (hovered || focused)) {
                  event.preventDefault(); event.stopPropagation();
                  setHovered(null); setFocused(null);
                }
              }}
              className={cn('relative grid h-11 w-11 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70',
                selected ? 'bg-white/[.055]' : !disabledReason && 'hover:bg-white/[.035]', unavailable && 'opacity-35', disabledReason && !unavailable && 'cursor-default')}
              data-testid={`button-voice-specialist-${profile.id}`}>
              {selected && <motion.span layoutId="voice-specialist-selection" className="pointer-events-none absolute inset-0 rounded-full border"
                style={{ borderColor: `${SPECIALIST_VISUALS[profile.id].color}30` }} transition={{ duration: reduceMotion ? 0 : .25 }} />}
              <SpecialistOrb id={profile.id} active={selected} state={state} amplitude={amplitude} />
              <span id={`voice-specialist-desc-${profile.id}`} className="sr-only">{profile.description}</span>
            </button>
          );
        })}

        <div className={cn('pointer-events-none absolute z-30 grid',
          compact ? 'left-1/2 top-full mt-1.5 -translate-x-1/2'
            : 'left-1/2 top-full mt-1.5 -translate-x-1/2 lg:left-full lg:top-0 lg:ml-2.5 lg:mt-0 lg:translate-x-0')}>
          <AnimatePresence>
            {hoverProfile && (
              <motion.div key={hoverProfile.id} initial={{ opacity: 0, x: compact ? 0 : -3 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : .14 }}
                className="col-start-1 row-start-1 self-start w-[212px] max-w-[calc(100vw-32px)] rounded-xl border border-white/[.07] bg-[#070b17]/90 px-3 py-2 text-left shadow-lg backdrop-blur-xl"
                role="tooltip" data-testid="voice-specialist-tooltip">
                <div className="flex items-baseline gap-2">
                  <span className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full" style={{ background: SPECIALIST_VISUALS[hoverProfile.id].color }} />
                  <p className="shrink-0 text-[12px] font-medium tracking-[.04em]" style={{ color: SPECIALIST_VISUALS[hoverProfile.id].color }}>{hoverProfile.name}</p>
                </div>
                <p className="mt-1 font-mono text-[8px] uppercase leading-relaxed tracking-[.1em] text-white/40">{hoverProfile.title}</p>
                {(!compact || reason(hoverProfile.id)) && <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/50 [@media(max-height:560px)]:line-clamp-1">{reason(hoverProfile.id) || hoverProfile.description}</p>}
                {preview && <p className="mt-1 font-mono text-[7px] uppercase tracking-[.16em] text-white/30">Identity preview · no audio</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
}
