import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, CheckCircle2, ClipboardCheck, Download, FlaskConical, Plus, RotateCw, ShieldCheck, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { AdvisorOrb } from '@/components/advisor-ui';
import { requestIntelligence } from '@/lib/intelligence-client';

type ActionInput = { market: string; experiment: string; successSignal: string; constraints: string };
type Milestone = { name: string; deliverable: string; ownerRole: string; acceptanceCriteria: string; approvalGate: string | null };
type EvaluationCase = { scenario: string; expectedBehavior: string; failureSignal: string };
type ActionPlan = {
  title: string;
  hypothesis: string;
  decisionRule: string;
  measurement: { metric: string; baselineNeeded: string; observationMethod: string; reviewPoint: string };
  milestones: Milestone[];
  evaluationCases: EvaluationCase[];
  assumptions: string[];
  stopConditions: string[];
};
type Status = 'TODO' | 'IN_PROGRESS' | 'DONE';
type EditablePlan = Omit<ActionPlan, 'milestones'> & { milestones: (Milestone & { status: Status })[] };
type Verdict = 'NOT_TESTED' | 'INCONCLUSIVE' | 'CONTINUE' | 'CHANGE' | 'STOP';
type Observation = { baseline: string; observed: string; evidence: string; verdict: Verdict };

const inputValidator = z.object({
  market: z.string().trim().min(2).max(80),
  experiment: z.string().trim().min(40).max(2000),
  successSignal: z.string().trim().min(10).max(400),
  constraints: z.string().trim().max(1000),
});
const seedValidator = z.object({
  market: z.string().max(80), experiment: z.string().max(2000),
  successSignal: z.string().max(400), constraints: z.string().max(1000),
});
const editableText = z.string().max(2000);
const milestoneValidator = z.object({
  name: editableText, deliverable: editableText, ownerRole: editableText,
  acceptanceCriteria: editableText, approvalGate: editableText.nullable(),
});
const caseValidator = z.object({ scenario: editableText, expectedBehavior: editableText, failureSignal: editableText });
const planValidator = z.object({
  title: z.string().min(8).max(140),
  hypothesis: z.string().min(20).max(400),
  decisionRule: z.string().min(20).max(400),
  measurement: z.object({ metric: z.string().min(5).max(200), baselineNeeded: z.string().min(10).max(300), observationMethod: z.string().min(10).max(300), reviewPoint: z.string().min(10).max(200) }),
  milestones: z.array(milestoneValidator).min(3).max(5),
  evaluationCases: z.array(caseValidator).min(3).max(5),
  assumptions: z.array(z.string().min(5).max(250)).min(2).max(4),
  stopConditions: z.array(z.string().min(10).max(250)).min(1).max(3),
});
const storedDraftValidator = z.object({
  version: z.literal(1),
  savedAt: z.string().max(40),
  input: inputValidator,
  plan: planValidator.extend({ milestones: z.array(milestoneValidator.extend({ status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']) })).max(12), evaluationCases: z.array(caseValidator).max(12) }),
  observation: z.object({ baseline: editableText, observed: editableText, evidence: editableText, verdict: z.enum(['NOT_TESTED', 'INCONCLUSIVE', 'CONTINUE', 'CHANGE', 'STOP']) }),
});
const DRAFT_KEY = 'syntra.action.draft.v1';

function draftExists() {
  try { return localStorage.getItem(DRAFT_KEY) !== null; } catch { return false; }
}

const EXAMPLES: { label: string; input: ActionInput }[] = [
  { label: 'Support workflow', input: { market: 'Service operations', experiment: 'Pilot a grounded internal support assistant for one policy area. Staff should review every suggested answer before it is sent, and exceptions should route to a person.', successSignal: 'Staff resolve routine questions faster without reducing answer accuracy or bypassing approvals.', constraints: 'Use approved policy material only; no autonomous customer messages.' } },
  { label: 'Property triage', input: { market: 'Property', experiment: 'Trial a single shared intake view for property enquiries from existing channels, with assisted categorisation and a human deciding which enquiries need immediate follow-up.', successSignal: 'The team can identify and respond to priority enquiries more consistently.', constraints: 'Do not change existing customer communication channels during the pilot.' } },
  { label: 'Learning support', input: { market: 'Education', experiment: 'Pilot a course support workflow that suggests answers from approved learning material and sends uncertain or sensitive questions to a staff member.', successSignal: 'Learners receive useful answers while staff can catch and correct unsupported suggestions.', constraints: 'Keep staff review for learner-impacting guidance.' } },
];

function consumeSeed(): ActionInput | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem('syntra.action.seed');
    if (!raw) return null;
    sessionStorage.removeItem('syntra.action.seed');
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object') {
      const candidate = value as Partial<ActionInput>;
      const parsed = seedValidator.safeParse({ market: candidate.market, experiment: candidate.experiment, successSignal: candidate.successSignal, constraints: candidate.constraints ?? '' });
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Storage may be disabled. The sample scenario remains usable.
  }
  return null;
}

function exportMarkdown(input: ActionInput, plan: EditablePlan, observation: Observation) {
  const lines = [
    `# ${plan.title}`,
    '',
    `Market: ${input.market}`,
    `Experiment: ${input.experiment}`,
    `Success signal: ${input.successSignal}`,
    `Constraints: ${input.constraints || 'None supplied'}`,
    '',
    `## Hypothesis\n${plan.hypothesis}`,
    `## Decision rule\n${plan.decisionRule}`,
    `## Measurement\nMetric: ${plan.measurement.metric}\nBaseline needed: ${plan.measurement.baselineNeeded}\nObservation method: ${plan.measurement.observationMethod}\nReview point: ${plan.measurement.reviewPoint}`,
    ...plan.milestones.map((m, index) => `## Milestone ${index + 1}: ${m.name}\nStatus: ${m.status}\nOwner role: ${m.ownerRole}\nDeliverable: ${m.deliverable}\nAcceptance: ${m.acceptanceCriteria}\nApproval gate: ${m.approvalGate || 'None specified'}`),
    ...plan.evaluationCases.map((c, index) => `## Evaluation case ${index + 1}\nScenario: ${c.scenario}\nExpected behavior: ${c.expectedBehavior}\nFailure signal: ${c.failureSignal}`),
    `## Assumptions\n${plan.assumptions.map((item) => `- ${item}`).join('\n')}`,
    `## Stop conditions\n${plan.stopConditions.map((item) => `- ${item}`).join('\n')}`,
    `## Observed result\nBaseline: ${observation.baseline || 'Not recorded'}\nObserved: ${observation.observed || 'Not recorded'}\nEvidence note: ${observation.evidence || 'Not recorded'}\nTeam verdict: ${observation.verdict.replace('_', ' ')}`,
  ];
  return lines.join('\n\n');
}

const fieldClass = 'mt-2 w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50';
const smallFieldClass = 'mt-1.5 w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50';

export default function ActionStudio() {
  const [input, setInput] = useState<ActionInput>(() => consumeSeed() ?? EXAMPLES[0].input);
  const [submittedInput, setSubmittedInput] = useState<ActionInput | null>(null);
  const [plan, setPlan] = useState<EditablePlan | null>(null);
  const [observation, setObservation] = useState<Observation>({ baseline: '', observed: '', evidence: '', verdict: 'NOT_TESTED' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [draftAvailable, setDraftAvailable] = useState(draftExists);
  const [draftMessage, setDraftMessage] = useState('');
  const [resultVersion, setResultVersion] = useState(0);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => { if (resultVersion > 0) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [resultVersion]);

  function setField(key: keyof ActionInput, value: string) { setInput((current) => ({ ...current, [key]: value })); }
  function editMilestone(index: number, key: keyof (Milestone & { status: Status }), value: string | null) {
    setPlan((current) => current && ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  }
  function editCase(index: number, key: keyof EvaluationCase, value: string) {
    setPlan((current) => current && ({ ...current, evaluationCases: current.evaluationCases.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !inputValidator.safeParse(input).success) return;
    setPending(true);
    setError('');
    setPlan(null);
    try {
      const parsedPlan = planValidator.safeParse(await requestIntelligence('action', input));
      if (!parsedPlan.success) throw new Error('The generated plan was incomplete. Try again.');
      const next = parsedPlan.data as ActionPlan;
      setSubmittedInput({ ...input });
      setPlan({ ...next, milestones: next.milestones.map((item) => ({ ...item, status: 'TODO' as const })) });
      setObservation({ baseline: '', observed: '', evidence: '', verdict: 'NOT_TESTED' });
      setResultVersion((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The plan could not be created.');
    } finally {
      setPending(false);
    }
  }

  function download() {
    if (!plan || !submittedInput) return;
    const blob = new Blob([exportMarkdown(submittedInput, plan, observation)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'syntra-action-plan.md';
    link.click();
    URL.revokeObjectURL(url);
  }

  function saveDraft() {
    if (!plan || !submittedInput) return;
    const parsed = storedDraftValidator.safeParse({ version: 1, savedAt: new Date().toISOString(), input: submittedInput, plan, observation });
    if (!parsed.success) {
      setDraftMessage('This draft is too large or has invalid fields. Shorten long edits before saving.');
      return;
    }
    try {
      const serialized = JSON.stringify(parsed.data);
      if (serialized.length > 150_000) {
        setDraftMessage('This draft is too large to save in this browser. Export it instead.');
        return;
      }
      localStorage.setItem(DRAFT_KEY, serialized);
      setDraftAvailable(true);
      setDraftMessage('Draft saved in this browser. Save again after further edits.');
    } catch {
      setDraftMessage('Browser storage is unavailable. Export the plan instead.');
    }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw || raw.length > 150_000) throw new Error('No valid saved draft');
      const parsed = storedDraftValidator.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new Error('No valid saved draft');
      setInput(parsed.data.input);
      setSubmittedInput(parsed.data.input);
      setPlan(parsed.data.plan as EditablePlan);
      setObservation(parsed.data.observation);
      setError('');
      setDraftMessage(`Restored the draft saved ${new Date(parsed.data.savedAt).toLocaleString()}.`);
      setResultVersion((current) => current + 1);
    } catch {
      setDraftMessage('No valid saved draft is available in this browser.');
    }
  }

  function clearSavedDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      setDraftAvailable(false);
      setDraftMessage('Saved browser draft cleared. The open plan remains until you leave this page.');
    } catch {
      setDraftMessage('Browser storage is unavailable.');
    }
  }

  const completed = plan?.milestones.filter((item) => item.status === 'DONE').length ?? 0;

  return <div className="tool-workspace pb-12">
    <div className="tool-entry grid items-start gap-4 md:grid-cols-[minmax(0,0.83fr)_minmax(0,1.17fr)]">
      <div className="tool-intro relative overflow-hidden rounded-[30px] border border-primary/15 bg-[radial-gradient(circle_at_75%_15%,hsl(217_95%_63%/.17),transparent_42%),linear-gradient(130deg,hsl(229_49%_10%/.85),hsl(236_48%_5%/.7))] p-6 md:sticky md:top-4 md:min-h-[430px]">
        <div className="absolute -right-6 -top-5 opacity-35 sm:right-3 sm:top-2"><AdvisorOrb size={92} live={false} /></div>
        <div className="relative max-w-[650px]">
          <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-primary"><FlaskConical className="h-3.5 w-3.5" /> 04 / Action Studio</div>
          <h1 className="font-display text-3xl font-light leading-[1.12] tracking-[-0.045em]">Turn a decision into <span className="text-ember">a test you can run.</span></h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-foreground/70">Scope the first experiment, assign owners, define approval gates and record what actually happened. A good pilot can tell you to continue, change course or stop.</p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><span>Plan</span><span className="text-primary/50">/</span><span>Evaluate</span><span className="text-primary/50">/</span><span>Decide</span></div>
        </div>
      </div>
      <form onSubmit={generate} className="tool-form edge-light glass rounded-[28px] p-5 sm:p-7" data-testid="form-action-studio">
        <div className="mb-5 flex items-center gap-3"><ClipboardCheck className="h-4 w-4 text-primary" /><div><h2 className="text-sm font-semibold">Start with one bounded experiment</h2><p className="text-xs text-muted-foreground">Use a sample or describe a pilot your team could run.</p></div></div>
        <fieldset disabled={pending} className="min-w-0">
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Sample experiments">{EXAMPLES.map((example) => <button key={example.label} type="button" onClick={() => { setInput(example.input); setPlan(null); setError(''); }} className="rounded-full border border-border bg-background/30 px-3 py-1.5 text-xs text-foreground/70 transition hover:border-primary/40 hover:text-primary">{example.label}</button>)}</div>
        <div className="tool-fields grid gap-4">
          <label className="block text-xs font-medium text-foreground/80">Market or context<input value={input.market} onChange={(event) => setField('market', event.target.value)} required minLength={2} maxLength={80} className={fieldClass} data-testid="input-action-market" /></label>
          <label className="block text-xs font-medium text-foreground/80">What exactly would you test?<textarea value={input.experiment} onChange={(event) => setField('experiment', event.target.value)} required minLength={40} maxLength={2000} rows={4} className={`${fieldClass} resize-y leading-relaxed`} data-testid="input-action-experiment" /></label>
          <label className="block text-xs font-medium text-foreground/80">What would count as a useful result?<textarea value={input.successSignal} onChange={(event) => setField('successSignal', event.target.value)} required minLength={10} maxLength={400} rows={2} className={`${fieldClass} resize-y leading-relaxed`} data-testid="input-action-success" /></label>
          <label className="block text-xs font-medium text-foreground/80">Constraints <span className="font-normal text-muted-foreground">(optional)</span><input value={input.constraints} onChange={(event) => setField('constraints', event.target.value)} maxLength={1000} className={fieldClass} placeholder="e.g. Keep a person in approval, use existing tools" /></label>
        </div>
        </fieldset>
        <div className="tool-submit mt-5 flex flex-wrap items-center justify-between gap-4"><p className="max-w-md text-xs leading-relaxed text-muted-foreground">Syntra drafts a plan; it does not execute it. Plans are saved only when you choose Save in this browser. Do not enter secrets or sensitive personal data.</p><button type="submit" disabled={pending || input.market.trim().length < 2 || input.experiment.trim().length < 40 || input.successSignal.trim().length < 10} className="group flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:shadow-[0_0_30px_hsl(187_92%_69%/.35)] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-action-plan">{pending ? <><RotateCw className="h-4 w-4 animate-spin" /> Building plan…</> : <>Build the pilot plan <ArrowUpRight className="h-4 w-4" /></>}</button></div>
        {draftAvailable && <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-xs"><span className="text-muted-foreground">A draft is saved in this browser.</span><button type="button" onClick={restoreDraft} disabled={pending} className="font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-action-restore">Restore saved draft</button><button type="button" onClick={clearSavedDraft} disabled={pending} className="text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-action-clear">Clear saved draft</button></div>}
        {draftMessage && <p role="status" className="mt-3 text-xs text-muted-foreground">{draftMessage}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </form>
    </div>

    {plan && <motion.section ref={resultRef} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mt-7 space-y-5" aria-label="Action plan" data-testid="action-plan">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">Action plan / {submittedInput?.market}</div><h2 className="mt-2 font-display text-2xl font-light leading-tight tracking-tight sm:text-3xl">{plan.title}</h2><p className="mt-2 text-xs text-muted-foreground">{completed} of {plan.milestones.length} milestones marked complete by you</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={saveDraft} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20" data-testid="button-action-save">Save draft in this browser</button><button type="button" onClick={download} className="flex items-center gap-2 rounded-full border border-primary/25 px-3 py-2 text-xs text-primary transition hover:bg-primary/10" data-testid="button-action-export"><Download className="h-3.5 w-3.5" /> Export current plan</button></div></div>
      <div className="grid gap-3 lg:grid-cols-2"><Panel title="Hypothesis" text={plan.hypothesis} /><Panel title="Decision rule" text={plan.decisionRule} /></div>
      <div className="edge-light glass rounded-[26px] p-5 sm:p-6"><div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-primary"><FlaskConical className="h-4 w-4" /> Measurement design</div><div className="grid gap-4 sm:grid-cols-2"><Panel title="Metric" text={plan.measurement.metric} bare /><Panel title="Baseline to collect" text={plan.measurement.baselineNeeded} bare /><Panel title="Observation method" text={plan.measurement.observationMethod} bare /><Panel title="Review point" text={plan.measurement.reviewPoint} bare /></div></div>
      <div><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">Milestones / editable</div><button type="button" onClick={() => setPlan((current) => current && ({ ...current, milestones: [...current.milestones, { name: 'New milestone', deliverable: '', ownerRole: '', acceptanceCriteria: '', approvalGate: null, status: 'TODO' }] }))} className="inline-flex items-center gap-1.5 text-xs text-primary"><Plus className="h-3.5 w-3.5" /> Add milestone</button></div><div className="space-y-3">{plan.milestones.map((item, index) => <div key={index} className="rounded-[24px] border border-border bg-card/65 p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Step {String(index + 1).padStart(2, '0')}</span><div className="flex items-center gap-3"><select value={item.status} onChange={(event) => editMilestone(index, 'status', event.target.value)} aria-label={`Milestone ${index + 1} status`} className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs"><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></select><button type="button" onClick={() => setPlan((current) => current && ({ ...current, milestones: current.milestones.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove milestone ${index + 1}`} className="text-muted-foreground transition hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div></div><div className="grid gap-4 md:grid-cols-2"><Edit label="Milestone" value={item.name} onChange={(value) => editMilestone(index, 'name', value)} /><Edit label="Owner role" value={item.ownerRole} onChange={(value) => editMilestone(index, 'ownerRole', value)} /><Edit label="Deliverable" value={item.deliverable} onChange={(value) => editMilestone(index, 'deliverable', value)} multiline /><Edit label="Acceptance criteria" value={item.acceptanceCriteria} onChange={(value) => editMilestone(index, 'acceptanceCriteria', value)} multiline /><div className="md:col-span-2"><Edit label="Human approval gate (if needed)" value={item.approvalGate ?? ''} onChange={(value) => editMilestone(index, 'approvalGate', value || null)} multiline /></div></div></div>)}</div></div>
      <div><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">Evaluation cases / editable</div><button type="button" onClick={() => setPlan((current) => current && ({ ...current, evaluationCases: [...current.evaluationCases, { scenario: '', expectedBehavior: '', failureSignal: '' }] }))} className="inline-flex items-center gap-1.5 text-xs text-primary"><Plus className="h-3.5 w-3.5" /> Add case</button></div><div className="grid gap-3 lg:grid-cols-2">{plan.evaluationCases.map((item, index) => <div key={index} className="rounded-[24px] border border-border bg-card/65 p-5"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Case {String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => setPlan((current) => current && ({ ...current, evaluationCases: current.evaluationCases.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove evaluation case ${index + 1}`} className="text-muted-foreground transition hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div><div className="space-y-3"><Edit label="Scenario" value={item.scenario} onChange={(value) => editCase(index, 'scenario', value)} multiline /><Edit label="Expected behavior" value={item.expectedBehavior} onChange={(value) => editCase(index, 'expectedBehavior', value)} multiline /><Edit label="Failure signal" value={item.failureSignal} onChange={(value) => editCase(index, 'failureSignal', value)} multiline /></div></div>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2"><ListPanel title="Assumptions to test" items={plan.assumptions} /><ListPanel title="Stop conditions" items={plan.stopConditions} /></div>
      <div className="rounded-[26px] border border-primary/30 bg-primary/[0.05] p-5 sm:p-6"><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-primary"><ShieldCheck className="h-4 w-4" /> Outcome scorecard</div><p className="mb-5 text-sm leading-relaxed text-foreground/70">Record observed results here. Syntra does not infer that the pilot worked; your team selects the verdict after reviewing evidence.</p><div className="grid gap-4 sm:grid-cols-2"><Edit label="Real baseline" value={observation.baseline} onChange={(value) => setObservation((current) => ({ ...current, baseline: value }))} multiline /><Edit label="Observed result" value={observation.observed} onChange={(value) => setObservation((current) => ({ ...current, observed: value }))} multiline /><div className="sm:col-span-2"><Edit label="Evidence note or measurement source" value={observation.evidence} onChange={(value) => setObservation((current) => ({ ...current, evidence: value }))} multiline /></div><label className="block text-xs font-medium text-foreground/80">Team verdict<select value={observation.verdict} onChange={(event) => setObservation((current) => ({ ...current, verdict: event.target.value as Verdict }))} className={smallFieldClass}><option value="NOT_TESTED">Not tested</option><option value="INCONCLUSIVE">Inconclusive</option><option value="CONTINUE">Continue</option><option value="CHANGE">Change course</option><option value="STOP">Stop</option></select></label></div>{observation.verdict !== 'NOT_TESTED' && (!observation.observed.trim() || !observation.evidence.trim()) && <p role="note" className="mt-4 text-xs text-ember">Add the observed result and evidence note before treating this verdict as a validated outcome.</p>}</div>
      <div className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Export includes your edits and observations. Save explicitly to keep this draft across visits in this browser; it is not shared or stored in a cloud workspace.</div>
    </motion.section>}
  </div>;
}

function Panel({ title, text, bare = false }: { title: string; text: string; bare?: boolean }) {
  return <div className={bare ? '' : 'rounded-[22px] border border-border bg-card/65 p-5'}><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{title}</div><p className="mt-2 text-sm leading-relaxed text-foreground/80">{text}</p></div>;
}

function Edit({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="block text-xs font-medium text-foreground/80">{label}{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={2} className={`${smallFieldClass} resize-y leading-relaxed`} /> : <input value={value} onChange={(event) => onChange(event.target.value)} className={smallFieldClass} />}</label>;
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-[22px] border border-border bg-card/65 p-5"><h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/85">{title}</h3><ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2 text-xs leading-relaxed text-foreground/70"><span className="text-primary/60">0{index + 1}</span><span>{item}</span></li>)}</ul></div>;
}
