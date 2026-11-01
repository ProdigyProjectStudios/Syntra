import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, Download, FileText, FlaskConical, LoaderCircle, Plus, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAdvisor } from '@/lib/advisor';

type Source = { id: string; title: string; text: string };
type Citation = { sourceId: string; quote: string };
type Claim = { statement: string; assessment: 'SUPPORTED' | 'CONFLICTED' | 'UNCLEAR'; explanation: string; citations: Citation[] };
type EvidenceAnalysis = {
  headline: string;
  stance: 'TEST' | 'REVISE' | 'PAUSE';
  revisedDecision: string;
  rationale: string;
  claims: Claim[];
  gaps: string[];
  nextValidationStep: string;
};

const SAMPLE_DECISION = 'Should our support team build an AI assistant to answer routine account and policy questions, and what would be safe to test first?';
const SAMPLE_SOURCES: Source[] = [
  { id: 'sample-operations', title: 'Illustrative support note', text: 'Team members repeatedly answer account and policy questions using scattered internal documents. The current weekly volume has not been measured. Routine answers are usually checked by a team lead before they are sent. A searchable knowledge base is not yet available.' },
  { id: 'sample-approval', title: 'Illustrative approval note', text: 'Exceptions involving refunds, eligibility or account access must be reviewed by a named human approver. The team may draft a suggested response, but an automated system may not send an exception decision. Staff report that some policy documents are out of date.' },
];

function readDecisionSeed(): string | null {
  try {
    const raw = sessionStorage.getItem('syntra.evidence.seed');
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('decision' in value) || typeof value.decision !== 'string') return null;
    const decision = value.decision.trim().slice(0, 2000);
    return decision.length >= 20 ? decision : null;
  } catch {
    return null;
  }
}

function exportMarkdown(decision: string, analysis: EvidenceAnalysis, sources: Source[]) {
  return [
    `# ${analysis.headline}`,
    `Decision reviewed: ${decision}`,
    `Stance: ${analysis.stance}`,
    `## Revised decision\n${analysis.revisedDecision}`,
    `## Rationale\n${analysis.rationale}`,
    ...analysis.claims.map((claim) => `### ${claim.assessment}: ${claim.statement}\n${claim.explanation}${claim.citations.length ? `\n${claim.citations.map((citation) => `> ${citation.quote}\n> — ${sources.find((source) => source.id === citation.sourceId)?.title ?? citation.sourceId}`).join('\n')}` : ''}`),
    `## Evidence gaps\n${analysis.gaps.map((gap) => `- ${gap}`).join('\n')}`,
    `## Next validation step\n${analysis.nextValidationStep}`,
    'Source excerpts were supplied by the visitor. Citations confirm that the quoted text appears in those excerpts; Syntra has not independently verified the documents.',
  ].join('\n\n');
}

function sourceWithHighlight(source: Source, quote?: string) {
  if (!quote) return source.text;
  const index = source.text.indexOf(quote);
  if (index < 0) return source.text;
  return <>{source.text.slice(0, index)}<mark className="rounded bg-primary/20 px-0.5 text-primary">{quote}</mark>{source.text.slice(index + quote.length)}</>;
}

export default function EvidenceRoom() {
  const [incomingDecision] = useState(readDecisionSeed);
  const [decision, setDecision] = useState(incomingDecision ?? SAMPLE_DECISION);
  const [sources, setSources] = useState<Source[]>(incomingDecision ? [{ id: 'seed-note', title: '', text: '' }] : SAMPLE_SOURCES);
  const [result, setResult] = useState<EvidenceAnalysis | null>(null);
  const [reviewedDecision, setReviewedDecision] = useState('');
  const [reviewedSources, setReviewedSources] = useState<Source[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [handoffError, setHandoffError] = useState('');
  const nextId = useRef(1);
  const editVersion = useRef(0);
  const resultRef = useRef<HTMLElement>(null);
  const [, navigate] = useLocation();
  const { send, sending } = useAdvisor();

  useEffect(() => {
    try {
      sessionStorage.removeItem('syntra.evidence.seed');
    } catch {
      // Storage can be disabled; the seeded value is already held in component state.
    }
  }, [incomingDecision]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  function markChanged() {
    editVersion.current += 1;
    setResult(null);
    setError('');
    setHandoffError('');
  }

  function editSource(id: string, patch: Partial<Source>) {
    setSources((current) => current.map((source) => source.id === id ? { ...source, ...patch } : source));
    markChanged();
  }

  function addSource() {
    if (sources.length >= 3) return;
    setSources((current) => [...current, { id: `note-${nextId.current++}`, title: '', text: '' }]);
    markChanged();
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (sources.length + files.length > 3) {
      setError('Evidence Room accepts up to three sources. Remove one before importing another.');
      return;
    }
    const imported: Source[] = [];
    for (const file of files) {
      if (!/\.(txt|md|csv|json)$/i.test(file.name) || file.size > 20_000) {
        setError('Import plain-text, Markdown, CSV or JSON files under 20 KB. PDF extraction is not available in this pilot.');
        return;
      }
      const text = (await file.text()).trim();
      if (text.length < 80 || text.length > 6000) {
        setError('Each source needs 80–6,000 characters. Shorten large files before importing.');
        return;
      }
      imported.push({ id: `file-${nextId.current++}`, title: file.name.slice(0, 100), text });
    }
    setSources((current) => [...current, ...imported]);
    markChanged();
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setResult(null);
    setBusy(true);
    const requestVersion = editVersion.current;
    try {
      const response = await fetch('/api/evidence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: decision.trim(), sources: sources.map((source) => ({ ...source, title: source.title.trim(), text: source.text.trim() })) }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload ? String(payload.error) : 'The review could not complete.';
        throw new Error(message);
      }
      if (requestVersion !== editVersion.current) {
        setError('The decision or sources changed during review. Run it again with the current material.');
        return;
      }
      const analysis = payload as EvidenceAnalysis;
      setReviewedDecision(decision.trim());
      setReviewedSources(sources.map((source) => ({ ...source })));
      setSelectedCitation(analysis.claims.flatMap((claim) => claim.citations)[0] ?? null);
      setResult(analysis);
    } catch (cause) {
      setError(requestVersion !== editVersion.current ? 'The material changed during review. Run it again.' : cause instanceof Error ? cause.message : 'The review could not complete.');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([exportMarkdown(reviewedDecision, result, reviewedSources)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'syntra-evidence-review.md';
    link.click();
    URL.revokeObjectURL(url);
  }

  function continueInAdvisor() {
    if (!result || sending) return;
    void send(`I reviewed a decision in Syntra Evidence Room. Decision: ${reviewedDecision}\nRevised decision: ${result.revisedDecision}\nRationale: ${result.rationale}\nEvidence gaps: ${result.gaps.join('; ')}\nNext validation step: ${result.nextValidationStep}. Help me turn this into a bounded project brief while challenging any weak assumptions.`);
    navigate('/');
  }

  function openActionStudio() {
    if (!result) return;
    const paused = result.stance === 'PAUSE';
    const experiment = (paused
      ? `Resolve evidence gaps before implementation: ${result.gaps.join('; ')}. ${result.nextValidationStep}`
      : `${result.revisedDecision}\n\nEvidence review: ${result.rationale}`).slice(0, 2000);
    const successSignal = paused
      ? 'The named evidence gaps are resolved and the decision can be reviewed using documented findings.'
      : 'The next validation step is completed with documented findings that support or revise the decision.';
    const constraints = `${paused ? 'Evidence review stance: PAUSE. Resolve evidence gaps before implementation. ' : `Evidence review stance: ${result.stance}. `}Evidence review: ${result.rationale} Gaps: ${result.gaps.join('; ')}`.slice(0, 1000);
    try {
      sessionStorage.setItem('syntra.action.seed', JSON.stringify({ market: 'Operations', experiment, successSignal: successSignal.slice(0, 400), constraints }));
      setHandoffError('');
      navigate('/action');
    } catch {
      setHandoffError('Browser storage is unavailable. Export the review, then paste the revised decision into Action Studio.');
    }
  }

  const valid = decision.trim().length >= 20 && decision.trim().length <= 2000 && sources.length > 0 && sources.every((source) => source.title.trim().length >= 2 && source.text.trim().length >= 80 && source.text.trim().length <= 6000);
  const inspectedSource = reviewedSources.find((source) => source.id === selectedCitation?.sourceId);
  const conflictCount = result?.claims.filter((claim) => claim.assessment === 'CONFLICTED').length ?? 0;

  return <div className="space-y-6 pb-12">
    <header className="relative overflow-hidden rounded-[30px] border border-primary/20 bg-[radial-gradient(circle_at_90%_10%,hsl(187_92%_69%/.12),transparent_42%),linear-gradient(130deg,hsl(229_49%_10%/.9),hsl(236_48%_5%/.7))] p-6 sm:p-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-primary">03 / Evidence Room</div>
      <h1 className="mt-4 max-w-3xl font-display text-3xl font-light leading-tight tracking-[-0.04em] sm:text-4xl">Find out what the <span className="text-ember">evidence actually says.</span></h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-foreground/70">Bring a decision and the notes behind it. Syntra connects claims to exact excerpts, surfaces conflicts and gaps, and shows how the decision should change.</p>
      <div className="mt-5 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><span>Source-linked claims</span><span className="text-primary/40">/</span><span>Visible uncertainty</span><span className="text-primary/40">/</span><span>One next check</span></div>
    </header>

    <form onSubmit={review} className="grid items-start gap-4 xl:grid-cols-[minmax(0,.83fr)_minmax(0,1.17fr)]" data-testid="form-evidence-room">
      <section className="edge-light glass rounded-[26px] p-5 sm:p-6">
        <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Decision under review</h2></div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">The sample is illustrative. Replace it with a decision your team is facing.</p>
        <label className="mt-5 block text-xs font-medium text-foreground/80">What decision needs evidence?<textarea value={decision} onChange={(event) => { setDecision(event.target.value); markChanged(); }} minLength={20} maxLength={2000} rows={6} required className="mt-2 w-full resize-y rounded-2xl border border-border bg-background/55 px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary/50" data-testid="input-evidence-decision" /></label>
        <div className="mt-3 flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-muted-foreground">{decision.trim().length} / 2000</span><button type="button" onClick={() => { setDecision(SAMPLE_DECISION); setSources(SAMPLE_SOURCES); markChanged(); }} className="text-xs text-primary hover:underline">Load illustrative sample</button></div>
        <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 text-xs leading-relaxed text-muted-foreground"><ShieldAlert className="mb-2 h-4 w-4 text-primary" />Sources are sent for this review and not saved by Evidence Room. Do not include secrets or sensitive personal data. A citation confirms an excerpt appears in your text; it does not verify that the source itself is accurate.</div>
      </section>

      <section className="edge-light glass rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Source material <span className="font-normal text-muted-foreground">({sources.length}/3)</span></h2></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-foreground/75 hover:border-primary/40"><Upload className="h-3.5 w-3.5" /> Import text files<input type="file" multiple accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={importFiles} className="sr-only" data-testid="input-evidence-files" /></label></div>
        <p className="mt-2 text-xs text-muted-foreground">Paste or import up to three text sources, 80–6,000 characters each.</p>
        <div className="mt-4 space-y-3">{sources.map((source, index) => <div key={source.id} className="rounded-[20px] border border-border bg-background/35 p-4"><div className="mb-3 flex items-center justify-between gap-2"><span className="font-mono text-[10px] uppercase tracking-widest text-primary/70">Source 0{index + 1}</span><button type="button" onClick={() => { setSources((current) => current.filter((item) => item.id !== source.id)); markChanged(); }} aria-label={`Remove ${source.title || 'source'}`} className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div><label className="block text-xs text-muted-foreground">Source title<input value={source.title} onChange={(event) => editSource(source.id, { title: event.target.value })} maxLength={100} required className="mt-1.5 w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" /></label><label className="mt-3 block text-xs text-muted-foreground">Excerpt or notes<textarea value={source.text} onChange={(event) => editSource(source.id, { text: event.target.value })} minLength={80} maxLength={6000} rows={4} required className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:border-primary/50" /><span className="mt-1 block text-right font-mono text-[10px]">{source.text.trim().length} / 6000</span></label></div>)}</div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={addSource} disabled={sources.length >= 3} className="inline-flex items-center gap-1.5 text-xs text-primary disabled:opacity-35"><Plus className="h-3.5 w-3.5" /> Add source</button><button type="submit" disabled={!valid || busy} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:shadow-[0_0_25px_hsl(187_92%_69%/.3)] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-review-evidence">{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Reviewing…</> : <>Review the evidence <ArrowUpRight className="h-4 w-4" /></>}</button></div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </section>
    </form>

    {result && <section ref={resultRef} className="space-y-4" aria-label="Evidence review" data-testid="evidence-results">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">Evidence review / {result.stance.toLowerCase()}</div><h2 className="mt-2 font-display text-2xl font-light tracking-tight sm:text-3xl">{result.headline}</h2></div><button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-xs text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> Export review</button></div>
      <div className="grid gap-3 md:grid-cols-2"><div className="rounded-[23px] border border-primary/30 bg-primary/[0.07] p-5"><div className="font-mono text-[10px] uppercase tracking-widest text-primary">Revised decision</div><p className="mt-3 text-sm leading-relaxed">{result.revisedDecision}</p></div><div className="rounded-[23px] border border-border bg-card/70 p-5"><div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Why</div><p className="mt-3 text-sm leading-relaxed text-foreground/75">{result.rationale}</p></div></div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.13fr)_minmax(0,.87fr)]"><div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Claim review</h3><span className="text-xs text-muted-foreground">{conflictCount} conflict{conflictCount === 1 ? '' : 's'} surfaced</span></div>{result.claims.map((claim, index) => <article key={`${claim.statement}-${index}`} className="rounded-[22px] border border-border bg-card/70 p-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${claim.assessment === 'SUPPORTED' ? 'bg-primary/15 text-primary' : claim.assessment === 'CONFLICTED' ? 'bg-ember/15 text-ember' : 'bg-muted text-muted-foreground'}`}>{claim.assessment}</span><span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span></div><h4 className="mt-3 text-sm font-semibold leading-relaxed">{claim.statement}</h4><p className="mt-2 text-xs leading-relaxed text-foreground/65">{claim.explanation}</p>{claim.citations.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{claim.citations.map((citation, citationIndex) => <button key={`${citation.sourceId}-${citationIndex}`} type="button" onClick={() => setSelectedCitation(citation)} className="rounded-full border border-primary/25 px-3 py-1.5 text-left text-xs text-primary hover:bg-primary/10">View {reviewedSources.find((source) => source.id === citation.sourceId)?.title ?? 'source'} <ArrowRight className="ml-1 inline h-3 w-3" /></button>)}</div>}</article>)}</div>
      <div className="space-y-3 xl:sticky xl:top-4"><div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Source inspector</div><div className="rounded-[22px] border border-primary/20 bg-card/70 p-5"><h3 className="text-sm font-semibold">{inspectedSource?.title ?? 'Select a cited excerpt'}</h3>{selectedCitation && <blockquote className="mt-3 border-l-2 border-primary/50 pl-3 text-sm leading-relaxed text-primary/85">“{selectedCitation.quote}”</blockquote>}<div className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 text-xs leading-relaxed text-foreground/70">{inspectedSource ? sourceWithHighlight(inspectedSource, selectedCitation?.quote) : 'Citations from the claim review appear here.'}</div></div><div className="rounded-[22px] border border-border bg-card/70 p-5"><h3 className="font-mono text-[10px] uppercase tracking-widest text-ember">Evidence gaps</h3><ul className="mt-3 space-y-3">{result.gaps.map((gap, index) => <li key={`${index}-${gap}`} className="flex gap-2 text-xs leading-relaxed text-foreground/70"><span className="font-mono text-ember/70">0{index + 1}</span>{gap}</li>)}</ul></div></div></div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-primary/20 bg-primary/[0.05] p-5"><div><div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" /> One next validation step</div><p className="mt-2 max-w-3xl text-xs leading-relaxed text-foreground/70">{result.nextValidationStep}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={openActionStudio} className="rounded-full border border-primary/35 px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10">{result.stance === 'PAUSE' ? 'Plan evidence collection' : 'Plan a test'} <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button><button type="button" onClick={continueInAdvisor} disabled={sending} className="rounded-full border border-border px-4 py-2.5 text-xs font-semibold text-foreground/75 hover:border-primary/30 disabled:opacity-50">Discuss the brief</button></div>{handoffError && <p role="alert" className="w-full text-xs text-destructive">{handoffError}</p>}</div>
    </section>}
  </div>;
}
