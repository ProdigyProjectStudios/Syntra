import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'wouter';
import { Check, Copy, Download, Pencil, X, RotateCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRuntimeKeys } from '@/lib/runtime-context';
import { useGetBrief, useUpdateBrief } from '@/lib/runtime-hooks';
import { formatProjectBrief, type BriefKey, type Brief, type Conversation, type FieldProvenance } from '@workspace/consultation';
import { errorMessage } from '@/lib/errors';
import { useAdvisor } from '@/lib/advisor';
import { useToast } from '@/hooks/use-toast';
import { AdvisorOrb } from '@/components/advisor-ui';
import { cn } from '@/lib/utils';

const FIELDS: { key: BriefKey; label: string; wide?: boolean }[] = [
  { key: 'objective', label: 'Objective', wide: true },
  { key: 'service', label: 'Service direction' },
  { key: 'proposedSolution', label: 'Proposed solution' },
  { key: 'requirements', label: 'Requirements', wide: true },
  { key: 'integrations', label: 'Integrations and dependencies' },
  { key: 'budget', label: 'Budget' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'nextStep', label: 'Next step' },
];

export default function BriefPage() {
  const { conversationId } = useAdvisor();
  const id = conversationId ?? 0;
  const { data, isLoading, isError, refetch } = useGetBrief(id);
  const filled = data ? FIELDS.filter((f) => data[f.key]).length : 0;
  const pct = filled / FIELDS.length;
  const [exportStatus, setExportStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const markdown = data ? formatProjectBrief(data) : '';
  async function copy() {
    if (!markdown) return;
    try { await navigator.clipboard.writeText(markdown); setExportStatus('copied'); }
    catch { setExportStatus('failed'); }
  }
  function download() {
    if (!markdown) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'syntra-project-brief.md';
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus('idle');
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-ion">03 / Working brief</div>
          <h1 className="font-display text-3xl font-light tracking-[-0.03em] sm:text-[2.75rem] sm:leading-[1.05]">The brief, <span className="text-ember glow-text">as it forms.</span></h1>
          <p className="mt-3 max-w-xl text-foreground/65">Only what has been discussed or clearly marked as a direction. Click any field to correct it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <button type="button" onClick={() => void copy()} disabled={!data} data-testid="button-copy-brief"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[.055] px-3 py-2 text-[11px] text-primary transition hover:bg-primary/[.12] disabled:opacity-35">
                {exportStatus === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {exportStatus === 'copied' ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={download} disabled={!data} data-testid="button-export-brief"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-[11px] text-foreground/80 transition hover:border-primary/30 hover:text-primary disabled:opacity-35">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
            {exportStatus === 'failed' && <span role="alert" className="text-[10px] text-amber-200">Clipboard unavailable. Use Export.</span>}
          </div>
          <CompletionDial pct={pct} filled={filled} lit={FIELDS.map((f) => !!data?.[f.key])} />
        </div>
      </div>

      {!conversationId && (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <div className="flex justify-center"><AdvisorOrb size={56} /></div>
          <p className="mt-4 font-display text-lg font-light">No brief yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Send the advisor your first message and fields will start to fill as you talk.</p>
          <Link href="/" className="mt-5 inline-block rounded-full bg-[linear-gradient(135deg,hsl(187_92%_70%),hsl(212_95%_62%))] px-5 py-2 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-[0_0_28px_-4px_hsl(199_95%_60%/.8)]" data-testid="link-start-discover">Start in Discover</Link>
        </div>
      )}
      {conversationId && isLoading && <div className="grid gap-3 md:grid-cols-2">{FIELDS.map((f) => <div key={f.key} className="h-28 rounded-2xl bg-secondary/40 animate-pulse" />)}</div>}
      {isError && (
        <button onClick={() => refetch()} className="flex items-center gap-2 text-destructive" data-testid="button-retry-brief"><RotateCw className="h-4 w-4" /> Brief failed to load. Retry</button>
      )}
      {data && conversationId && (
        <div className="grid gap-3 md:grid-cols-2">
          {FIELDS.map((f, i) => <Field key={`${conversationId}-${f.key}`} id={conversationId} field={f} value={data[f.key]} index={i} revision={data.revision} provenance={data.provenance[f.key]} />)}
        </div>
      )}
    </div>
  );
}

/** Eight neurons on a ring, one per brief field. Established fields light up and wire into the core. */
function CompletionDial({ pct, filled, lit }: { pct: number; filled: number; lit: boolean[] }) {
  const S = 112, C = S / 2, r = 44;
  const pts = lit.map((_, i) => {
    const a = -Math.PI / 2 + (i / lit.length) * Math.PI * 2;
    return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r };
  });
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4" data-testid="status-brief-completion">
      <div className="relative" style={{ width: S, height: S }}>
        <div className="absolute inset-0 grid place-items-center">
          <AdvisorOrb size={44} live thinking={pct === 1} />
        </div>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id="dial-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="hsl(187 92% 69%)" /><stop offset="1" stopColor="hsl(217 95% 63%)" /></linearGradient>
            <filter id="dial-glow"><feGaussianBlur stdDeviation="2.2" /></filter>
          </defs>
          <circle cx={C} cy={C} r={r} stroke="hsl(222 34% 14%)" strokeWidth="1" fill="none" />
          <motion.circle cx={C} cy={C} r={r} stroke="url(#dial-g)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeDasharray={circ} transform={`rotate(-90 ${C} ${C})`} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - pct) }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
          {pts.map((p, i) => lit[i] && (
            <motion.line key={`l${i}`} x1={C} y1={C} x2={p.x} y2={p.y} stroke="hsl(199 95% 65% / .35)" strokeWidth="0.75" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.3 + i * 0.08, duration: 0.8 }} />
          ))}
          {pts.map((p, i) => (
            <g key={i}>
              {lit[i] && <circle cx={p.x} cy={p.y} r="5" fill="hsl(187 92% 69% / .55)" filter="url(#dial-glow)" />}
              <motion.circle cx={p.x} cy={p.y} initial={{ r: 0 }} animate={{ r: lit[i] ? 2.6 : 1.8 }} transition={{ delay: 0.2 + i * 0.06, type: 'spring', stiffness: 300, damping: 18 }} fill={lit[i] ? 'hsl(185 100% 90%)' : 'hsl(222 30% 26%)'} />
            </g>
          ))}
        </svg>
      </div>
      <div>
        <div className="font-display text-2xl font-light">{filled}<span className="text-muted-foreground">/{FIELDS.length}</span></div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Fields established</div>
      </div>
    </div>
  );
}

function Field({ id, field, value, index, revision, provenance }: { id: number; field: (typeof FIELDS)[number]; value: string | null; index: number; revision: number; provenance?: FieldProvenance }) {
  const { getGetBriefQueryKey, getGetConversationQueryKey } = useRuntimeKeys();
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateBrief();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editRevision, setEditRevision] = useState(revision);
  const [fired, setFired] = useState(0);

  const save = () => {
    const v = draft.trim();
    update.mutate(
      { id, data: { [field.key]: v || null, revision: editRevision } },
      {
        onSuccess: (b) => {
          qc.setQueryData(getGetBriefQueryKey(id), b);
          qc.setQueryData<Conversation>(getGetConversationQueryKey(id), prev => prev ? { ...prev, brief: b } : prev);
          setEditing(false);
          setFired((n) => n + 1);
        },
        onError: (error) => {
          void qc.invalidateQueries({ queryKey: getGetBriefQueryKey(id) });
          toast({ title: 'Could not save', description: errorMessage(error, `${field.label} was not updated. Your draft is preserved.`) });
        },
      },
    );
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn('group relative overflow-hidden rounded-[22px] glass p-5 sweep', field.wide && 'md:col-span-2', value && 'edge-light')}
      data-testid={`field-${field.key}`}
    >
      <AnimatePresence>
        {fired > 0 && (
          <motion.span
            key={fired}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            initial={{ opacity: 1, background: 'radial-gradient(circle at 12px 18px, hsl(187 92% 69% / .35), transparent 30%)' }}
            animate={{ opacity: 0, background: 'radial-gradient(circle at 12px 18px, hsl(217 95% 63% / .0), transparent 160%)' }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </AnimatePresence>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', value ? 'bg-primary shadow-[0_0_10px_hsl(187_92%_69%),0_0_18px_hsl(217_95%_63%/.6)]' : 'bg-muted-foreground/30')} />
          {field.label}
          {provenance && <span className="tracking-normal text-primary/70" title={provenance.status === 'manual' ? 'Your correction takes priority over AI suggestions' : provenance.evidence} data-testid={`status-${field.key}`}>{provenance.status === 'manual' ? 'Edited' : provenance.status === 'suggested' ? 'Suggested' : 'Confirmed'}</span>}
        </div>
        {!editing && (
          <button onClick={() => { setDraft(value ?? ''); setEditRevision(revision); setEditing(true); }} aria-label={`Edit ${field.label}`} data-testid={`button-edit-${field.key}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-60 transition hover:bg-secondary hover:text-primary group-hover:opacity-100">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div>
          {revision !== editRevision && <div className="mb-3 text-xs text-primary" role="alert">This field's brief changed while you were editing. Latest value: {value || 'Not established'}. Your draft is still below. <button type="button" className="underline" onClick={() => setEditRevision(revision)}>Review complete; use this revision</button></div>}
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} data-testid={`input-${field.key}`} className="w-full resize-none rounded-xl border border-input bg-background/60 p-3 text-sm outline-none focus:border-primary/60" />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid={`button-cancel-${field.key}`}><X className="h-3.5 w-3.5" /> Cancel</button>
            <button onClick={save} disabled={update.isPending} className="flex items-center gap-1 rounded-full bg-[linear-gradient(135deg,hsl(187_92%_70%),hsl(212_95%_62%))] px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-shadow hover:shadow-[0_0_20px_-2px_hsl(199_95%_60%/.7)] disabled:opacity-50" data-testid={`button-save-${field.key}`}><Check className="h-3.5 w-3.5" /> {update.isPending ? 'Saving' : 'Save'}</button>
          </div>
        </div>
      ) : value ? (
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-relaxed">{value}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground/70">Not established yet</p>
      )}
    </motion.div>
  );
}
