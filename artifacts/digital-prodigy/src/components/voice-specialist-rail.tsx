import { useRef, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, SlidersHorizontal, Check } from 'lucide-react';
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
    <div className="relative h-11 w-11 shrink-0" aria-hidden>
      <motion.span className="absolute inset-1.5 rounded-full border border-transparent"
        style={{ borderTopColor: `${visual.color}80`, borderBottomColor: `${visual.color}20` }}
        animate={reduceMotion ? undefined : { rotate: id === 'technical' ? -360 : 360 }}
        transition={{ duration: visual.period, repeat: Infinity, ease: 'linear' }} />
      <span className="absolute inset-x-0.5 top-[13px] h-[18px] rounded-[50%] border"
        style={{ transform: `rotate(${visual.orbit}deg)`, borderColor: `${visual.color}${active ? '40' : '20'}` }} />
      <div className="absolute -inset-1" style={{ filter: `hue-rotate(${visual.hue}deg)` }}>
        <NeuralCore size={52} nodes={48} bloom={false} still={Boolean(reduceMotion)}
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
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState<SpecialistId | null>(null);
  const [focused, setFocused] = useState<SpecialistId | null>(null);
  const reduceMotion = useReducedMotion();
  const buttons = useRef(new Map<SpecialistId, HTMLButtonElement>());
  const horizontal = compact && !expanded;
  const candidate = hovered ?? focused;
  const hoverProfile = candidate ? getSpecialistProfile(candidate) : null;
  const reason = (id: SpecialistId) => !supported.includes(id)
    ? 'This specialist is not available in the current voice session.'
    : id !== active ? lockedReason : undefined;
  const changeExpansion = (next: boolean) => {
    setExpanded(next); setHovered(null); setFocused(null);
    // The selected orb survives both layouts. Focus it before the toggle unmounts,
    // without a delayed callback that could steal focus after the dialog closes.
    buttons.current.get(active)?.focus({ preventScroll: true });
  };
  const choose = (id: SpecialistId) => {
    if (id === active || reason(id) || switching) return;
    onSelect(id);
    if (compact) setExpanded(false);
  };

  return (
    <aside className={cn('absolute z-20', compact ? 'inset-x-4 top-[calc(64px+env(safe-area-inset-top))] flex justify-center' : 'left-5 top-1/2 -translate-y-1/2 lg:left-8')}
      aria-label="Voice specialists" data-testid="voice-specialist-rail">
      <motion.div layout initial={false} animate={{ width: expanded ? compact ? 280 : 244 : horizontal ? 208 : 64 }}
        transition={{ duration: reduceMotion ? 0 : .28, ease: [.16, 1, .3, 1] }}
        className={cn('relative max-w-[calc(100vw-32px)] border border-white/[.075] bg-[#060914]/85 shadow-[0_12px_70px_-24px_rgba(34,211,238,.18)] backdrop-blur-xl',
          horizontal ? 'flex items-center gap-0.5 rounded-full px-1.5 py-1' : 'flex flex-col rounded-[28px] p-1.5')}>
        {expanded && (
          <div className="mb-1 flex items-center justify-between gap-3 px-3 pb-1 pt-2">
            <p className="font-mono text-[9px] uppercase tracking-[.23em] text-white/40">{preview ? 'Identity preview' : 'Voice intelligence'}</p>
            <button onClick={() => changeExpansion(false)} aria-label="Collapse voice specialists" aria-expanded={true}
              className="grid h-8 w-8 place-items-center rounded-full text-white/40 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-primary"
              data-testid="button-collapse-specialists">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className={cn('relative flex', horizontal ? 'items-center gap-0.5' : 'flex-col gap-1')} role="group" aria-label="Choose a voice specialist">
          {SPECIALISTS.map((profile, index) => {
            const selected = profile.id === active;
            const disabledReason = reason(profile.id);
            const unavailable = !supported.includes(profile.id);
            return (
              <button key={profile.id} ref={element => { if (element) buttons.current.set(profile.id, element); else buttons.current.delete(profile.id); }}
                type="button" aria-pressed={selected} aria-disabled={Boolean(disabledReason || switching)}
                aria-label={`${profile.name}, ${profile.title}${selected ? ', selected' : ''}${disabledReason ? `. ${disabledReason}` : ''}${preview ? '. Preview only; voice is not connected.' : ''}`}
                onClick={() => choose(profile.id)}
                onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(profile.id); }}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setFocused(profile.id)} onBlur={() => setFocused(null)}
                onKeyDown={event => {
                  const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
                  if (direction) { event.preventDefault(); buttons.current.get(SPECIALISTS[(index + direction + SPECIALISTS.length) % SPECIALISTS.length].id)?.focus(); }
                }}
                className={cn('group relative flex min-h-12 min-w-12 items-center gap-2.5 rounded-[22px] px-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70',
                  selected ? 'bg-white/[.055]' : !disabledReason && 'hover:bg-white/[.035]', unavailable && 'opacity-35', disabledReason && !unavailable && 'cursor-default', expanded && 'w-full px-1.5 py-1')}
                data-testid={`button-voice-specialist-${profile.id}`}>
                {selected && <motion.span layoutId="voice-specialist-selection" className="pointer-events-none absolute inset-0 rounded-[22px] border"
                  style={{ borderColor: `${SPECIALIST_VISUALS[profile.id].color}25` }} transition={{ duration: reduceMotion ? 0 : .25 }} />}
                <SpecialistOrb id={profile.id} active={selected} state={state} amplitude={amplitude} />
                {expanded && <div className="min-w-0 flex-1 py-1 text-left">
                  <div className="flex items-center gap-2 text-[13px] font-medium tracking-[.04em]" style={{ color: selected ? SPECIALIST_VISUALS[profile.id].color : '#d6dfec' }}>
                    {profile.name}{selected && <Check className="h-3 w-3 opacity-65" />}
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">{profile.title}</p>
                </div>}
              </button>
            );
          })}
        </div>
        {!expanded && <button onClick={() => changeExpansion(true)} aria-label="Expand voice specialists" aria-expanded={false}
          className={cn('grid shrink-0 place-items-center rounded-full text-white/35 transition hover:bg-white/5 hover:text-primary focus-visible:outline focus-visible:outline-primary', horizontal ? 'h-10 w-10' : 'mt-1 h-10 w-full')}
          data-testid="button-expand-specialists">
          {horizontal ? <SlidersHorizontal className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>}
        {expanded && <div className="mx-3 mb-2 mt-3 border-t border-white/[.06] pt-3 text-[10px] leading-relaxed text-white/35">
          {preview ? 'Preview only. No live audio is connected.' : 'One conversation. Shared context and project brief.'}
          {lockedReason && !preview && <p className="mt-1 text-white/50">{lockedReason}</p>}
        </div>}
      </motion.div>

      <AnimatePresence>
        {!expanded && hoverProfile && (
          <motion.div key={hoverProfile.id} initial={{ opacity: 0, y: compact ? -3 : 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : .15 }}
            className={cn('pointer-events-none absolute w-[248px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#080d1b]/95 px-4 py-3 text-left shadow-xl backdrop-blur-xl',
              compact ? 'left-1/2 top-full mt-2 -translate-x-1/2' : 'left-full top-1/2 ml-3 -translate-y-1/2')}
            role="tooltip" data-testid="voice-specialist-tooltip">
            <p className="text-[13px] font-medium tracking-[.04em]" style={{ color: SPECIALIST_VISUALS[hoverProfile.id].color }}>{hoverProfile.name}</p>
            <p className="mt-1 text-[11px] text-white/70">{hoverProfile.title}</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/45">{reason(hoverProfile.id) || hoverProfile.description}</p>
            {preview && <p className="mt-2 font-mono text-[8px] uppercase tracking-[.16em] text-white/30">Identity preview · no audio</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
