import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { Compass, Boxes, FileText, CalendarClock, History, Plus, X, Sparkles, BookOpenCheck, FlaskConical } from 'lucide-react';
import { useAdvisor } from '@/lib/advisor';
import { AdvisorOrb, Composer, DepthSwitch, HistoryList, Stream } from '@/components/advisor-ui';
import { VoiceConsole, OPEN_VOICE_EVENT } from '@/components/voice';
import { NeuralField } from '@/components/neural-field';
import { ClickBurst } from '@/components/click-burst';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import logo from '@/assets/dp-logo.png';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Discover', icon: Compass, code: '01' },
  { href: '/lab', label: 'Decision Lab', icon: Sparkles, code: '02' },
  { href: '/evidence', label: 'Evidence Room', icon: BookOpenCheck, code: '03' },
  { href: '/action', label: 'Action Studio', icon: FlaskConical, code: '04' },
  { href: '/solutions', label: 'Solutions', icon: Boxes, code: '05' },
  { href: '/brief', label: 'Project Brief', icon: FileText, code: '06' },
  { href: '/book', label: 'Book', icon: CalendarClock, code: '07' },
];

export function Shell({ children }: { children: (location: string) => ReactNode }) {
  const [location, navigate] = useLocation();
  const { setConversationId, conversation, sending, pendingText } = useAdvisor();
  const [voice, setVoice] = useState(false);
  const [hist, setHist] = useState(false);
  const onDiscover = location === '/';
  const onTool = ['/lab', '/evidence', '/action'].includes(location);
  const current = NAV.find((n) => n.href === location);

  // anything sent from another view (composer, step chips, cards) brings the conversation into place
  useEffect(() => {
    if (pendingText !== null && location !== '/') navigate('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingText]);

  useEffect(() => {
    const open = () => setVoice(true);
    window.addEventListener(OPEN_VOICE_EVENT, open);
    return () => window.removeEventListener(OPEN_VOICE_EVENT, open);
  }, []);

  return (
    <div className="env dark relative flex h-[100dvh] w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 grid-floor" />
      <NeuralField energy={sending || voice ? 1 : 0} />

      {/* Slim instrument rail */}
      <aside className="relative z-20 hidden w-[72px] shrink-0 flex-col items-center py-5 lg:flex">
        <div className="pointer-events-none absolute inset-y-4 right-0 w-px bg-gradient-to-b from-transparent via-primary/25 to-transparent" />
        <Link href="/" data-testid="link-home" className="relative grid h-11 w-11 place-items-center">
          <span className="absolute inset-0 rounded-full bg-primary/20 blur-xl anim-breathe" />
          <img src={logo} alt="Digital Prodigy" className="relative h-9 w-9 object-contain drop-shadow-[0_0_10px_rgba(0,255,255,.45)]" />
        </Link>
        <nav className="relative mt-10 flex flex-col gap-2" aria-label="Experiences">
          {NAV.map((n) => {
            const active = location === n.href;
            return (
              <Tooltip key={n.href}>
                <TooltipTrigger asChild>
                  <Link href={n.href} aria-label={n.label} data-testid={`link-${n.label.toLowerCase().replace(' ', '-')}`} className={cn('group relative grid h-11 w-11 place-items-center rounded-2xl transition-colors', active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                    {active && (
                      <motion.span layoutId="rail-active" transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-2xl border border-primary/30 bg-[linear-gradient(160deg,hsl(187_92%_69%/.12),hsl(217_95%_60%/.08))] shadow-[0_0_24px_-6px_rgba(34,211,238,.55),inset_0_1px_0_rgba(207,250,254,.15)]">
                        <span className="absolute -left-[15px] top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-gradient-to-b from-primary to-ion halo" />
                      </motion.span>
                    )}
                    <n.icon className="relative h-[18px] w-[18px] transition-transform group-hover:scale-110" strokeWidth={1.6} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="border-white/10 bg-card/90 font-mono text-[10px] uppercase tracking-[0.2em] backdrop-blur">{n.code} / {n.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <RailButton label="New session" testId="button-new-conversation" onClick={() => setConversationId(null)}><Plus className="h-[18px] w-[18px]" strokeWidth={1.6} /></RailButton>
          <RailButton label="Sessions" testId="button-open-history-rail" onClick={() => setHist(true)}><History className="h-[18px] w-[18px]" strokeWidth={1.6} /></RailButton>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 lg:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="Digital Prodigy" className="h-8 w-8 object-contain drop-shadow-[0_0_8px_rgba(0,255,255,.4)] lg:hidden" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', sending ? 'bg-primary halo animate-pulse' : 'bg-primary/60')} />
                <AnimatePresence mode="wait">
                  <motion.span key={current?.label ?? 'x'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-primary/80">{current ? `${current.code} ${current.label}` : 'Off-grid'}</motion.span>
                </AnimatePresence>
              </div>
              <div className="mt-0.5 hidden truncate text-sm text-foreground/70 sm:block" data-testid="text-conversation-title">{conversation?.title ?? 'New session'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!onTool && <DepthSwitch compact />}
            <button onClick={() => setHist(true)} data-testid="button-open-history" aria-label="Sessions" className="grid h-9 w-9 place-items-center rounded-full glass lg:hidden"><History className="h-4 w-4" /></button>
          </div>
        </header>

        <nav className="relative mx-4 mt-3 flex rounded-full glass p-1 lg:hidden" aria-label="Experiences">
          {NAV.map((n) => {
            const active = location === n.href;
            return (
              <Link key={n.href} href={n.href} aria-label={n.label} title={n.label} data-testid={`link-m-${n.code}`} className={cn('relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[11px] font-medium transition-colors', active ? 'text-primary-foreground' : 'text-muted-foreground')}>
                {active && <motion.span layoutId="m-nav" transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,hsl(187_92%_70%),hsl(212_95%_62%))] halo" />}
                <n.icon className="relative h-3.5 w-3.5" />
                <span className="relative hidden min-[700px]:inline">{n.label.split(' ').pop()}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex min-h-0 flex-1 gap-5 px-4 py-4 sm:px-6">
          <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto scroll-thin [mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%-24px),transparent)]">
            <AnimatePresence mode="wait">
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -12, filter: 'blur(8px)' }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto max-w-4xl py-6"
              >
                {children(location)}
              </motion.div>
            </AnimatePresence>
          </main>
          <AnimatePresence>
            {!onDiscover && !onTool && (
              <motion.aside initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="edge-light hidden w-[340px] shrink-0 flex-col overflow-hidden rounded-[28px] glass xl:flex" aria-label="Conversation">
                <div className="flex items-center gap-3 px-5 py-4">
                  <AdvisorOrb size={30} thinking={sending} />
                  <div>
                    <div className="text-sm font-medium tracking-tight">Transcript</div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Live across every view</div>
                  </div>
                </div>
                <div className="mx-5 h-px bg-gradient-to-r from-primary/30 via-white/5 to-transparent" />
                <div className="min-h-0 flex-1 overflow-y-auto p-5 scroll-thin">
                  {conversation?.messages.length ? <Stream dense /> : <p className="text-sm leading-relaxed text-muted-foreground">Nothing said yet. Anything you send from here lands in the same thread.</p>}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {!onTool && <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="mx-auto max-w-3xl"><Composer onSpeak={() => setVoice(true)} /></div>
        </div>}
      </div>

      {/* Sessions drawer */}
      <AnimatePresence>
        {hist && (
          <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[#03040A]/70 backdrop-blur-sm" onClick={() => setHist(false)} />
            <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} className="edge-light glass absolute inset-y-3 left-3 flex w-[min(340px,calc(100%-24px))] flex-col rounded-[28px] p-5 lg:left-[84px]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="font-display text-base font-light tracking-tight">Sessions</div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Resume any thread</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => { setConversationId(null); setHist(false); }} data-testid="button-new-conversation-drawer" className="flex items-center gap-1 rounded-full border border-primary/30 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/10"><Plus className="h-3 w-3" /> New</button>
                  <button onClick={() => setHist(false)} aria-label="Close" data-testid="button-close-history" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 scroll-thin"><HistoryList onPick={() => setHist(false)} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <VoiceConsole open={voice} onClose={() => setVoice(false)} />
      <ClickBurst />
    </div>
  );
}

function RailButton({ label, testId, onClick, children }: { label: string; testId: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button onClick={onClick} aria-label={label} data-testid={testId} className="grid h-11 w-11 place-items-center rounded-2xl text-muted-foreground transition hover:bg-white/[0.04] hover:text-primary">{children}</button>
      </TooltipTrigger>
      <TooltipContent side="right" className="border-white/10 bg-card/90 font-mono text-[10px] uppercase tracking-[0.2em] backdrop-blur">{label}</TooltipContent>
    </Tooltip>
  );
}
