import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, Download, FlaskConical, Layers3, RotateCw, Sparkles } from 'lucide-react';
import { useAnalyzeOpportunity, type OpportunityAnalysis } from '@/lib/intelligence-client';
import { AdvisorOrb } from '@/components/advisor-ui';
import { useAdvisor } from '@/lib/advisor';

const EXAMPLES = [
  { market: 'Operations', label: 'Service operations', challenge: 'Our support team handles the same account and policy questions every day, but answers depend on scattered documents and people still need to approve exceptions. We need a safer way to reduce repetitive work without losing oversight.' },
  { market: 'Property', label: 'Property workflows', challenge: 'A property team receives enquiries across email and portals, then manually compares requirements with listings and follows up. Response times are inconsistent and we want to know which part should be automated first.' },
  { market: 'Education', label: 'Learning support', challenge: 'Learners ask similar questions across courses and staff spend hours finding the right material. We want to improve response quality while keeping source material current and handing difficult cases to a person.' },
  { market: 'Retail', label: 'Commerce decisions', challenge: 'Our retail team reviews product feedback and support conversations in separate tools. We need to spot recurring issues faster and decide whether a lightweight process change or an AI system is justified.' },
];

function toMarkdown(market: string, challenge: string, analysis: OpportunityAnalysis) {
  return [
    `# ${analysis.headline}`,
    `Market: ${market}`,
    `Challenge: ${challenge}`,
    '',
    `## Diagnosis\n${analysis.diagnosis}`,
    `## Value at stake\n${analysis.valueAtStake}`,
    ...analysis.routes.map((route, index) => `## Path ${index + 1}: ${route.name}${index === analysis.recommendedRoute ? ' (recommended)' : ''}\n${route.approach}\n\nFirst release: ${route.firstRelease}\nEffort: ${route.effort}\nRisk: ${route.mainRisk}\nTradeoff: ${route.tradeoff}`),
    `## Why this path\n${analysis.recommendationReason}`,
    `## First experiment\n${analysis.firstExperiment}\n\nSuccess signal: ${analysis.successSignal}`,
    `## Assumptions\n${analysis.assumptions.map((item) => `- ${item}`).join('\n')}`,
    `## Questions to resolve\n${analysis.questions.map((item) => `- ${item}`).join('\n')}`,
    `## Transfer to other markets\n${analysis.adjacentMarkets.map((item) => `- ${item.market}: ${item.transfer}`).join('\n')}`,
    `Confidence: ${analysis.confidence} — ${analysis.confidenceReason}`,
  ].join('\n\n');
}

export default function DecisionLab() {
  const [market, setMarket] = useState('Operations');
  const [challenge, setChallenge] = useState(EXAMPLES[0].challenge);
  const [constraints, setConstraints] = useState('');
  const [result, setResult] = useState<OpportunityAnalysis | null>(null);
  const [handoffError, setHandoffError] = useState('');
  const [lastInput, setLastInput] = useState({ market: '', challenge: '', constraints: '' });
  const analysis = useAnalyzeOpportunity();
  const { send, sending } = useAdvisor();
  const [, navigate] = useLocation();
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (challenge.trim().length < 40 || analysis.isPending) return;
    setResult(null);
    try {
      const next = await analysis.mutateAsync({ data: { market: market.trim(), challenge: challenge.trim(), constraints: constraints.trim() } });
      setLastInput({ market: market.trim(), challenge: challenge.trim(), constraints: constraints.trim() });
      setResult(next);
    } catch {
      // The mutation state renders the API error below.
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([toMarkdown(lastInput.market, lastInput.challenge, result)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'syntra-decision-canvas.md';
    link.click();
    URL.revokeObjectURL(url);
  }

  function continueInAdvisor() {
    if (!result || sending) return;
    const route = result.routes[result.recommendedRoute];
    void send(`I used Syntra's Decision Lab for ${lastInput.market}. My challenge: ${lastInput.challenge}\nConstraints: ${lastInput.constraints || 'None supplied'}\n\nThe recommended path was ${route.name}: ${route.firstRelease}. The first experiment was ${result.firstExperiment}. Key unknowns: ${result.questions.join('; ')}. Help me challenge these assumptions and shape a practical first release.`);
    navigate('/');
  }

  function continueToTool(destination: 'evidence' | 'action') {
    if (!result) return;
    try {
      const route = result.routes[result.recommendedRoute];
      if (destination === 'evidence') {
        sessionStorage.setItem('syntra.evidence.seed', JSON.stringify({
          market: lastInput.market, constraints: lastInput.constraints,
          decision: `Constraints: ${lastInput.constraints || 'None supplied'}\nProposed path: ${route.name}. ${route.firstRelease}\nContext: ${lastInput.challenge}`.slice(0, 2000),
        }));
      } else {
        sessionStorage.setItem('syntra.action.seed', JSON.stringify({ market: lastInput.market, experiment: result.firstExperiment.slice(0, 2000), successSignal: result.successSignal.slice(0, 400), constraints: lastInput.constraints || result.assumptions.join('; ').slice(0, 1000) }));
      }
      navigate(destination === 'evidence' ? '/evidence' : '/action');
    } catch {
      setHandoffError('Your browser blocked the handoff. Export this canvas and open the next tool from the navigation.');
    }
  }

  return (
    <div className="tool-workspace pb-12">
      <div className="tool-entry grid items-start gap-4 md:grid-cols-[minmax(0,0.83fr)_minmax(0,1.17fr)]">
      <div className="tool-intro relative overflow-hidden rounded-[30px] border border-primary/15 bg-[radial-gradient(circle_at_80%_20%,hsl(187_92%_69%/.13),transparent_42%),linear-gradient(130deg,hsl(229_49%_10%/.85),hsl(236_48%_5%/.7))] p-6 md:sticky md:top-4 md:min-h-[430px]">
        <div className="absolute -right-6 -top-5 opacity-40 sm:right-3 sm:top-2"><AdvisorOrb size={92} live={false} /></div>
        <div className="relative max-w-[650px]">
          <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-primary"><Sparkles className="h-3.5 w-3.5" /> 02 / Decision Lab</div>
          <h1 className="font-display text-3xl font-light leading-[1.12] tracking-[-0.045em]">See the paths <span className="text-ember">before you build.</span></h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-foreground/70">Describe a real bottleneck. Syntra compares three ways forward, picks a first experiment, and shows what it still needs to know. Useful across product, operations and service teams.</p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><span>03 paths</span><span className="text-primary/50">/</span><span>01 recommendation</span><span className="text-primary/50">/</span><span>Explicit uncertainty</span></div>
        </div>
      </div>

      <form onSubmit={run} className="tool-form edge-light glass rounded-[28px] p-5 sm:p-7" data-testid="form-decision-lab">
        <div className="mb-5 flex items-center gap-3"><Layers3 className="h-4 w-4 text-primary" /><div><h2 className="text-sm font-semibold">Start with a real decision</h2><p className="text-xs text-muted-foreground">Try a sample, then replace it with your own situation.</p></div></div>
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Sample scenarios">
          {EXAMPLES.map((example) => <button key={example.label} type="button" onClick={() => { setMarket(example.market); setChallenge(example.challenge); setResult(null); analysis.reset(); }} className="rounded-full border border-border bg-background/30 px-3 py-1.5 text-xs text-foreground/70 transition hover:border-primary/40 hover:text-primary" data-testid={`sample-${example.market.toLowerCase()}`}>{example.label}</button>)}
        </div>
        <div className="tool-fields grid gap-4">
          <label className="block text-xs font-medium text-foreground/80">Market or context<input value={market} onChange={(event) => setMarket(event.target.value)} required minLength={2} maxLength={80} className="mt-2 w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50" placeholder="e.g. Education, logistics, internal operations" data-testid="input-market" /></label>
          <label className="block text-xs font-medium text-foreground/80">What is happening today, and what should improve?<textarea value={challenge} onChange={(event) => setChallenge(event.target.value)} required minLength={40} maxLength={3000} rows={5} className="mt-2 w-full resize-y rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm leading-relaxed text-foreground outline-none transition focus:border-primary/50" placeholder="Describe the workflow, friction, people involved and desired outcome." data-testid="input-challenge" /><span className="mt-1 block text-right font-mono text-[10px] text-muted-foreground">{challenge.trim().length} / 3000</span></label>
          <label className="block text-xs font-medium text-foreground/80">Constraints <span className="font-normal text-muted-foreground">(optional)</span><input value={constraints} onChange={(event) => setConstraints(event.target.value)} maxLength={1000} className="mt-2 w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50" placeholder="e.g. Keep a human approval step; use existing tools first" data-testid="input-constraints" /></label>
        </div>
        <div className="tool-submit mt-5 flex flex-wrap items-center justify-between gap-4"><p className="max-w-md text-xs leading-relaxed text-muted-foreground">This canvas is generated on demand and is not saved by the Decision Lab. Do not enter secrets or sensitive personal data.</p><button type="submit" disabled={analysis.isPending || challenge.trim().length < 40 || market.trim().length < 2} className="group flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_25px_hsl(187_92%_69%/.22)] transition hover:shadow-[0_0_32px_hsl(187_92%_69%/.38)] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-analyze">{analysis.isPending ? <><RotateCw className="h-4 w-4 animate-spin" /> Mapping options…</> : <>Map the opportunity <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></>}</button></div>
        {analysis.isError && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">The analysis could not complete. Check the input or try again shortly.</p>}
      </form>
      </div>

      {result && <motion.section ref={resultRef} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mt-7 space-y-5" aria-label="Decision canvas" data-testid="decision-results">
        <div className="flex flex-wrap gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <button type="button" onClick={() => continueToTool('evidence')} className="rounded-full border border-primary/30 px-4 py-2 text-sm text-primary">Verify with your evidence <ArrowRight className="ml-2 inline h-4 w-4" /></button>
          <button type="button" onClick={() => continueToTool('action')} className="rounded-full border border-primary/30 px-4 py-2 text-sm text-primary">Plan the first experiment <ArrowRight className="ml-2 inline h-4 w-4" /></button>
          {handoffError && <p role="alert" className="text-xs text-ember">{handoffError}</p>}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">Decision canvas / {lastInput.market}</div><h2 className="mt-2 font-display text-2xl font-light leading-tight tracking-tight sm:text-3xl">{result.headline}</h2></div><button type="button" onClick={download} className="flex items-center gap-2 rounded-full border border-primary/25 px-3 py-2 text-xs text-primary transition hover:bg-primary/10" data-testid="button-download"><Download className="h-3.5 w-3.5" /> Export</button></div>
        <div className="grid gap-3 sm:grid-cols-2"><Insight label="The friction" text={result.diagnosis} /><Insight label="Value at stake" text={result.valueAtStake} /></div>
        <div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground"><Layers3 className="h-3.5 w-3.5" /> Three credible paths</div><div className="grid gap-3 lg:grid-cols-3">{result.routes.map((route, index) => <div key={`${route.name}-${index}`} className={`rounded-[24px] border p-5 ${index === result.recommendedRoute ? 'border-primary/45 bg-primary/[0.08] shadow-[inset_0_1px_0_hsl(187_92%_69%/.15)]' : 'border-border bg-card/70'}`}><div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><span>Path 0{index + 1}</span><span>{route.effort} effort</span></div><h3 className="mt-3 text-base font-semibold">{route.name}</h3>{index === result.recommendedRoute && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary"><Check className="h-3 w-3" /> Start here</span>}<p className="mt-3 text-sm leading-relaxed text-foreground/75">{route.approach}</p><div className="mt-4 border-t border-border pt-3 text-xs leading-relaxed"><div className="font-mono uppercase tracking-wider text-primary/80">First release</div><p className="mt-1 text-foreground/75">{route.firstRelease}</p><div className="mt-3 font-mono uppercase tracking-wider text-muted-foreground">Tradeoff</div><p className="mt-1 text-foreground/65">{route.tradeoff}</p><div className="mt-3 font-mono uppercase tracking-wider text-muted-foreground">Main risk</div><p className="mt-1 text-foreground/65">{route.mainRisk}</p></div></div>)}</div></div>
        <div className="edge-light glass rounded-[26px] p-5 sm:p-6"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-primary"><FlaskConical className="h-4 w-4" /> The first experiment</div><p className="mt-3 text-sm leading-relaxed text-foreground/85">{result.firstExperiment}</p><div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2"><Insight label="Why this path" text={result.recommendationReason} compact /><Insight label="Success signal" text={result.successSignal} compact /></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><ListPanel title="Assumptions to test" items={result.assumptions} /><ListPanel title="Questions that change the answer" items={result.questions} /></div>
        <div className="rounded-[24px] border border-border bg-card/50 p-5"><div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Pattern transfer</div><div className="mt-3 grid gap-3 sm:grid-cols-2">{result.adjacentMarkets.map((item) => <div key={item.market}><h3 className="text-sm font-semibold text-primary">{item.market}</h3><p className="mt-1 text-xs leading-relaxed text-foreground/65">{item.transfer}</p></div>)}</div><p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Confidence: {result.confidence.toLowerCase()} — {result.confidenceReason}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-primary/20 bg-primary/[0.05] p-5"><div><h3 className="text-sm font-semibold">Take the next step with Syntra</h3><p className="mt-1 text-xs text-muted-foreground">Challenge this canvas in conversation and turn the best path into an editable brief.</p></div><button type="button" onClick={continueInAdvisor} disabled={sending} className="flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-50" data-testid="button-continue-advisor">Explore this path <ArrowRight className="h-4 w-4" /></button></div>
      </motion.section>}
    </div>
  );
}

function Insight({ label, text, compact = false }: { label: string; text: string; compact?: boolean }) {
  return <div className={compact ? '' : 'rounded-[22px] border border-border bg-card/65 p-5'}><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div><p className="mt-2 text-sm leading-relaxed text-foreground/75">{text}</p></div>;
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-[22px] border border-border bg-card/65 p-5"><h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/85">{title}</h3><ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2 text-xs leading-relaxed text-foreground/70"><span className="text-primary/60">0{index + 1}</span><span>{item}</span></li>)}</ul></div>;
}
