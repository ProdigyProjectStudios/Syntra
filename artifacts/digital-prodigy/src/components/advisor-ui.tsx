import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, ArrowUpRight, RotateCw, Mic, Volume2, Square, LoaderCircle } from 'lucide-react';
import { useChatSpeech } from '@/hooks/use-chat-speech';
import { useListConversations } from '@/lib/runtime-hooks';
import { getSpecialistProfile, type Message } from '@workspace/consultation';
import { formatDistanceToNow } from 'date-fns';
import { DEPTHS, useAdvisor } from '@/lib/advisor';
import { NeuralCore } from '@/components/neural-core';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

/* ---------- Living advisor presence ---------- */
/** The advisor's mind at any size — the same neural core as voice mode, scaled down. */
export function AdvisorOrb({ size: requestedSize = 56, mobileSize, thinking = false, live }: { size?: number; mobileSize?: number; thinking?: boolean; live?: boolean }) {
  const mobile = useMediaQuery('(max-width: 639px)');
  const size = mobile ? mobileSize ?? requestedSize : requestedSize;
  const isLive = live ?? (thinking || size >= 40);
  const canvas = Math.round(size * 1.45);
  const nodes = size <= 32 ? 70 : size <= 90 ? 200 : 420;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-[-25%] rounded-full anim-breathe" style={{ background: 'radial-gradient(circle, hsl(187 92% 69% / .16), hsl(217 95% 60% / .06) 45%, transparent 70%)' }} />
      <NeuralCore
        key={`${nodes}-${isLive}-${thinking}`}
        size={canvas}
        nodes={nodes}
        state={thinking ? 'speaking' : 'idle'}
        still={!isLive}
        bloom={size >= 60}
        className="pointer-events-none !absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
}

/* ---------- Depth switcher ---------- */
/** One neural orb, anchored right; the three depths unfold leftward on hover, tap or focus. */
export function DepthSwitch({ compact = false }: { compact?: boolean }) {
  const { depth, setDepth } = useAdvisor();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const suppressFocusOpen = useRef(false);
  const currentIndex = Math.max(0, DEPTHS.findIndex(d => d.id === depth));
  const current = DEPTHS[currentIndex];
  const returnFocus = () => {
    suppressFocusOpen.current = true;
    trigger.current?.focus({ preventScroll: true });
    suppressFocusOpen.current = false;
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !event.composedPath().includes(root.current)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (root.current?.contains(document.activeElement)) returnFocus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  const focusRadio = (index: number) => requestAnimationFrame(() => group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus());

  return (
    <div className="flex items-center gap-3">
      {!compact && <span className="hidden xl:block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Next reply depth</span>}
      <div
        ref={root}
        className="relative h-9 w-9 shrink-0"
        onPointerEnter={e => { if (e.pointerType === 'mouse') setOpen(true); }}
        onPointerLeave={e => {
          if (e.pointerType === 'mouse' && !(root.current?.contains(document.activeElement) && document.activeElement?.matches(':focus-visible'))) setOpen(false);
        }}
        onFocus={e => { const t = e.target as HTMLElement; if (!suppressFocusOpen.current && (t !== trigger.current || t.matches(':focus-visible'))) setOpen(true); }}
        onBlur={e => { if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
      >
        <motion.div
          ref={group}
          role="radiogroup"
          aria-label="Response depth"
          inert={!open}
          aria-hidden={!open}
          initial={false}
          animate={open ? { opacity: 1, x: 0, scaleX: 1 } : { opacity: 0, x: reduce ? 0 : 12, scaleX: reduce ? 1 : 0.55 }}
          transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: 'right center' }}
          className={cn('absolute right-full top-1/2 z-50 mr-1.5 flex -translate-y-1/2 rounded-full glass p-1 shadow-[0_12px_40px_-12px_hsl(210_95%_55%/.5)] after:absolute after:inset-y-0 after:-right-2 after:w-2 after:content-[\'\']', !open && 'pointer-events-none')}
        >
          {DEPTHS.map((d, i) => {
            const active = depth === d.id;
            return (
              <Tooltip key={d.id}><TooltipTrigger asChild><button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={d.label}
                tabIndex={active ? 0 : -1}
                onKeyDown={event => {
                  const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
                  const index = event.key === 'Home' ? 0 : event.key === 'End' ? DEPTHS.length - 1 : direction ? (i + direction + DEPTHS.length) % DEPTHS.length : -1;
                  if (index < 0) return;
                  event.preventDefault();
                  setDepth(DEPTHS[index].id);
                  focusRadio(index);
                }}
                data-testid={`button-depth-${d.id}`}
                onClick={event => {
                  setDepth(d.id);
                  setOpen(false);
                  if (event.detail === 0) returnFocus();
                  else (event.currentTarget as HTMLButtonElement).blur();
                }}
                className={cn('relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors', active ? 'text-primary ring-1 ring-primary/25 bg-primary/5' : 'text-muted-foreground hover:text-foreground')}
              >
                <AdvisorOrb size={14 + i * 5} live={active && open} />
              </button></TooltipTrigger><TooltipContent side="bottom" sideOffset={12} className="rounded-2xl border border-primary/20 bg-[#080d1b]/95 px-4 py-3 shadow-[0_12px_40px_#0008] backdrop-blur-xl"><p className="text-sm text-primary">{d.label}</p><p className="mt-1 text-xs text-white/50">{d.hint}</p></TooltipContent></Tooltip>
            );
          })}
        </motion.div>
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={`Response depth: ${current.label}. ${open ? 'Hide' : 'Show'} depth options`}
          data-testid="button-depth-toggle"
          onClick={event => {
            if ((event.nativeEvent as PointerEvent).pointerType === 'mouse') setOpen(true);
            else setOpen(o => !o);
          }}
          onKeyDown={event => {
            if (['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'Enter', ' '].includes(event.key)) {
              event.preventDefault(); setOpen(true); focusRadio(currentIndex);
            }
          }}
          className={cn('relative grid h-9 w-9 place-items-center rounded-full glass transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', open && 'shadow-[0_0_0_1px_hsl(187_92%_69%/.35)]')}
        >
          <AdvisorOrb size={14 + currentIndex * 5} live />
        </button>
      </div>
    </div>
  );
}

/* ---------- Composer ---------- */
export function Composer({ onSpeak, voiceOpen = false }: { onSpeak: () => void; voiceOpen?: boolean }) {
  const { send, sending, specialist, conversation, conversationId, ensureVoiceConversation } = useAdvisor();
  const profile = getSpecialistProfile(specialist);
  const speech = useChatSpeech(ensureVoiceConversation, profile.voiceId, conversationId, voiceOpen);
  const latestReply = conversation?.messages.filter(message => message.role === 'advisor').at(-1)?.content;
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      el.style.height = '0px';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    };
    resize();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        resize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, mobile]);

  const submit = () => {
    if (!value.trim() || sending || speech.mode === 'dictating' || speech.mode === 'loading') return;
    speech.stop();
    send(value);
    setValue('');
  };

  return (
    <div className="flex items-end gap-2 sm:gap-3">
      <div className={cn('relative min-w-0 flex-1 rounded-[24px]  glass edge-light transition-shadow duration-500', focused && 'shadow-[0_0_0_1px_hsl(187_92%_69%/.35),0_20px_80px_-20px_hsl(210_95%_55%/.6)]')}>
        {sending && (
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px overflow-hidden">
            <div className="h-px w-1/3 anim-scan bg-gradient-to-r from-transparent via-primary to-transparent" />
          </div>
        )}
        <div className="flex flex-wrap items-end gap-1 p-1 pl-3.5">
          <textarea
            ref={ref}
            rows={1}
            maxLength={12000}
            value={value}
            readOnly={speech.mode === 'dictating' || speech.mode === 'loading'}
            data-testid="input-message"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Message ${profile.name}…`}
            aria-label="Message the advisor"
            className="max-h-40 min-h-[44px] min-w-0 basis-full sm:basis-0 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground/70 scroll-thin"
          />

          <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => speech.mode !== 'idle' ? speech.finish() : speech.dictate(value, setValue)}
            disabled={sending || speech.mode === 'playing'} aria-label={speech.mode === 'dictating' ? 'Finish dictation' : speech.mode === 'loading' ? 'Cancel speech' : 'Dictate message'}
            aria-pressed={speech.mode === 'dictating'} data-testid="button-dictate"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary transition hover:bg-primary/10 disabled:opacity-35 focus-visible:ring-1 focus-visible:ring-primary">
            {speech.mode === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : speech.mode === 'dictating' ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => speech.mode === 'playing' ? speech.stop() : latestReply && speech.play(latestReply)}
            disabled={!latestReply || sending || speech.mode === 'dictating' || speech.mode === 'loading'}
            aria-label={speech.mode === 'playing' ? 'Stop response playback' : 'Play latest response'} data-testid="button-play-response"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary transition hover:bg-primary/10 disabled:opacity-35 focus-visible:ring-1 focus-visible:ring-primary">
            {speech.mode === 'playing' ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => { speech.stop(); onSpeak(); }}
            data-testid="button-speak-mobile"
            aria-label="Open voice mode"
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary outline-none transition-transform active:scale-90 focus-visible:ring-1 focus-visible:ring-primary/60"
          >
            <AdvisorOrb size={28} live />
          </button>
          <button
            onClick={submit}
            disabled={!value.trim() || sending || speech.mode === 'dictating' || speech.mode === 'loading'}
            data-testid="button-send"
            aria-label="Send message"
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,hsl(187_92%_72%),hsl(205_95%_62%)_55%,hsl(217_95%_58%))] text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_-2px_hsl(199_95%_60%/.75)] halo active:scale-90 disabled:scale-100 disabled:bg-none disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
          </div>
        </div>
        {(speech.error || speech.mode !== 'idle') && <p role="status" className="px-4 pb-2 text-xs text-primary/80">{speech.error || (speech.mode === 'dictating' ? 'Listening… finish dictation to review and send. Audio is processed by the configured speech provider.' : speech.mode === 'playing' ? 'Playing the latest response…' : 'Connecting speech…')}</p>}
      </div>

    </div>
  );
}

/* ---------- Message stream ---------- */
function Bubble({ m, delay }: { m: Message; delay: number }) {
  const [arriving, setArriving] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setArriving(false), 2400); return () => window.clearTimeout(timer); }, []);
  const advisor = m.role === 'advisor';
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn('flex min-w-0 gap-3', !advisor && 'justify-end')}
      data-testid={`message-${m.id}`}
    >
      {advisor && <div className="mt-1"><AdvisorOrb size={22} thinking={arriving} /></div>}
      <div className={cn('max-w-[min(42rem,88%)]', advisor ? '' : 'rounded-2xl rounded-tr-md border border-ion/25 bg-[linear-gradient(135deg,hsl(217_90%_55%/.16),hsl(187_92%_69%/.07))] px-4 py-3')}>
        {advisor && (
          <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">Advisor</span>
            <span className="opacity-50">/</span>
            <span>{DEPTHS.find((d) => d.id === m.depth)?.label}</span>
          </div>
        )}
        <div className={cn('whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-relaxed', advisor ? 'text-foreground/90' : 'text-foreground')}>{m.content}</div>
      </div>
    </motion.div>
  );
}

export function ThinkingRow() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3" data-testid="status-thinking">
      <AdvisorOrb size={22} thinking />
      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Composing
        <span className="flex h-3 items-center gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-3 w-[2px] rounded bg-primary anim-bar" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </span>
      </div>
    </motion.div>
  );
}

export function StepChips({ steps }: { steps: string[] }) {
  const { send, sending } = useAdvisor();
  if (!steps.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((s, i) => (
        <motion.button
          key={s}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.07 }}
          disabled={sending}
          onClick={() => send(s)}
          data-testid={`button-step-${i}`}
          className="group flex items-center gap-2 sweep rounded-full border border-white/[0.07] bg-white/[0.025] px-4 py-2 backdrop-blur text-left text-sm text-foreground/85 transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-foreground disabled:opacity-40"
        >
          {s}
          <ArrowUpRight className="h-3.5 w-3.5 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </motion.button>
      ))}
    </div>
  );
}

export function Stream({ dense = false }: { dense?: boolean }) {
  const { conversation, pendingText, sending, error, retry, steps, loadingConversation, depth } = useAdvisor();
  const end = useRef<HTMLDivElement>(null);
  const saved = conversation?.messages ?? [];
  // the outgoing message occupies the same slot (and key) its saved copy will take, so when the
  // reply lands it stays perfectly still and only the advisor's new turn animates in
  const messages: Message[] = pendingText
    ? [...saved, { id: -1, role: 'visitor', content: pendingText, depth, createdAt: '' }]
    : saved;
  // only the thread present when the view opens gets the staggered entrance; later turns arrive at once
  const opened = useRef<number | null>(null);
  if (opened.current === null && !loadingConversation) opened.current = saved.length;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pendingText, steps.length]);

  if (loadingConversation) {
    return (
      <div className="space-y-5">
        {[70, 45, 82].map((w, i) => (
          <div key={i} className={cn('space-y-2', i === 1 && 'ml-auto w-1/2')}>
            <div className="h-3 rounded bg-secondary/70 animate-pulse" style={{ width: `${w}%` }} />
            <div className="h-3 rounded bg-secondary/50 animate-pulse" style={{ width: `${w - 20}%` }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', dense && 'space-y-4 text-sm')}>
      {/* position keys: the thread only appends, and the locally written turn is swapped for the server copy without re-animating */}
      {messages.map((m, i) => (
        <Bubble key={`${conversation?.id}-${i}`} m={m} delay={i < (opened.current ?? 0) ? Math.min(i * 0.03, 0.3) : 0} />
      ))}
      <AnimatePresence>{sending && <ThinkingRow />}</AnimatePresence>
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm" data-testid="status-error">
          <span>{error}</span>
          <button onClick={retry} data-testid="button-retry" className="flex items-center gap-1.5 font-semibold text-destructive hover:underline">
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}
      {!sending && <StepChips steps={steps} />}
      <div ref={end} />
    </div>
  );
}

/* ---------- Conversation history ---------- */
export function HistoryList({ onPick }: { onPick?: () => void }) {
  const { data, isLoading, isError, refetch } = useListConversations();
  const { conversationId, setConversationId, sending } = useAdvisor();
  if (isLoading)
    return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-secondary/50 animate-pulse" />)}</div>;
  if (isError)
    return (
      <button onClick={() => refetch()} className="text-sm text-destructive" data-testid="button-retry-history">
        Could not load sessions. Retry
      </button>
    );
  if (!data?.length)
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
        No sessions on record yet. Your first message opens a channel that survives reloads.
      </div>
    );
  return (
    <div className="space-y-1">
      {data.map((c) => {
        const active = c.id === conversationId;
        return (
          <button
            key={c.id}
            disabled={sending}
            data-testid={`button-conversation-${c.id}`}
            onClick={() => {
              setConversationId(c.id);
              onPick?.();
            }}
            className={cn('group relative w-full rounded-xl px-3 py-2.5 text-left transition-colors', active ? 'bg-primary/10' : 'hover:bg-secondary/60')}
          >
            {active && <motion.span layoutId="hist-active" className="absolute left-0 top-2 bottom-2 w-[2px] rounded bg-primary" />}
            <div className="truncate text-sm font-medium">{c.title}</div>
            <div className="mt-0.5 flex gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>{c.messageCount} msg</span>
              <span>{formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

