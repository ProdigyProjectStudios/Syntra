import { motion } from 'framer-motion';
import { useAdvisor, OPENING_STEPS } from '@/lib/advisor';
import { AdvisorOrb, StepChips, Stream } from '@/components/advisor-ui';
import { OPEN_VOICE_EVENT } from '@/components/voice';
import { useMediaQuery } from '@/hooks/use-media-query';
import { TextSpecialistSwitch, BlueprintNextStep } from '@/components/text-specialist-switch';
import { Link } from 'wouter';
import { ArrowUpRight, Sparkles } from 'lucide-react';

export default function Discover() {
  const { conversation, sending, pendingText, loadingConversation } = useAdvisor();
  const shortMobile = useMediaQuery('(max-width: 639px) and (max-height: 700px)');
  // the server's automatic welcome says what the hero says, so the hero stays until the visitor speaks
  const hasHistory = !!conversation?.messages.some((m) => m.role === 'visitor') || !!pendingText || loadingConversation;

  if (hasHistory) {
    return (
      <div className="pt-2">
        <TextSpecialistSwitch />
        <Stream />
        <BlueprintNextStep />
      </div>
    );
  }

  return (
    <div className="new-chat-intro relative flex min-h-full flex-col justify-center pb-1 pt-5 sm:py-14">
      <motion.div initial={{ opacity: 0, scale: 0.8, filter: 'blur(12px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} className="mb-3 ml-6 flex items-center gap-2 sm:mb-8 sm:-ml-6">
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_VOICE_EVENT))}
          aria-label="Talk to the advisor in voice mode"
          data-testid="button-hero-core"
          className="group relative grid place-items-center rounded-full outline-none"
        >
          <span className="pointer-events-none absolute inset-6 rounded-full border border-primary/0 transition-all duration-700 group-hover:inset-2 group-hover:border-primary/20" />
          <AdvisorOrb size={132} mobileSize={shortMobile ? 56 : 80} thinking={sending} />
        </button>
        <div className="hidden font-mono text-[10px] uppercase leading-relaxed tracking-[0.3em] text-muted-foreground/70 sm:block">
          <span className="text-primary/80">Touch the core</span><br />
          <span className="text-[#67e8f9] [text-shadow:0_0_8px_#22d3ee99,0_0_20px_#38bdf866]">Speak with it</span>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7 }}>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ion/90 sm:mb-4 sm:text-[11px]">Syntra online / Session 00</div>
        <h1 className="font-display text-[26px] font-light leading-[1.04] tracking-[-0.04em] sm:text-5xl lg:text-6xl" data-testid="text-opening-title">
          Bring the half-formed idea.<br />
          <span className="text-ember glow-text font-normal">We will scope the first build.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/70 sm:mt-6 sm:text-lg">
          I’m Syntra, Digital Prodigy’s AI build advisor. Tell me your idea—I’ll help shape it into a clear brief and an actionable Solution Blueprint.
        </p>
        <p className="mt-6 hidden font-medium sm:block">What would make the biggest difference if it existed next quarter?</p>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="intro-suggestions mt-4 sm:mt-8">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:mb-3">Suggested next steps</div>
        <StepChips steps={OPENING_STEPS} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="mt-8">
        <Link href="/lab" className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/20" data-testid="link-decision-lab-hero"><Sparkles className="h-4 w-4" /> Compare three paths in Decision Lab <ArrowUpRight className="h-4 w-4" /></Link>
      </motion.div>
    </div>
  );
}
