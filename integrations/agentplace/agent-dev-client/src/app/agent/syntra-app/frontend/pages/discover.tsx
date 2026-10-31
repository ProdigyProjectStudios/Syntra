import { motion } from 'framer-motion';
import { useAdvisor, OPENING_STEPS } from '../lib/advisor';
import { AdvisorOrb, StepChips, Stream } from '../components/advisor-ui';
import { OPEN_VOICE_EVENT } from '../components/voice';

export default function Discover() {
  const { conversation, sending, pendingText, loadingConversation } = useAdvisor();
  // the server's automatic welcome says what the hero says, so the hero stays until the visitor speaks
  const hasHistory = !!conversation?.messages.some((m) => m.role === 'visitor') || !!pendingText || loadingConversation;

  if (hasHistory) {
    return (
      <div className="pt-2">
        <Stream />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-col justify-center py-6 sm:py-14">
      <motion.div initial={{ opacity: 0, scale: 0.8, filter: 'blur(12px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} className="mb-8 -ml-6 flex items-center gap-2">
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_VOICE_EVENT))}
          aria-label="Talk to the advisor in voice mode"
          data-testid="button-hero-core"
          className="group relative grid place-items-center rounded-full outline-none"
        >
          <span className="pointer-events-none absolute inset-6 rounded-full border border-primary/0 transition-all duration-700 group-hover:inset-2 group-hover:border-primary/20" />
          <AdvisorOrb size={132} thinking={sending} />
        </button>
        <div className="hidden font-mono text-[10px] uppercase leading-relaxed tracking-[0.3em] text-muted-foreground/70 sm:block">
          <span className="text-primary/80">Touch the core</span><br />to speak with it
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7 }}>
        <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-ion/90">Advisor online / Session 00</div>
        <h1 className="font-display text-3xl font-light leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl" data-testid="text-opening-title">
          Bring the half-formed idea.<br />
          <span className="text-ember glow-text font-normal">We will scope the first build.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/70 sm:text-lg">
          I work for Digital Prodigy across AI MVPs and SaaS, client portals and dashboards, AI automation, and premium product UI. Describe the outcome in your own words. No spec, no budget required. Every detail we settle lands in a working brief you can edit.
        </p>
        <p className="mt-6 font-medium">What would make the biggest difference if it existed next quarter?</p>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-8">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Suggested next steps</div>
        <StepChips steps={OPENING_STEPS} />
      </motion.div>
    </div>
  );
}
