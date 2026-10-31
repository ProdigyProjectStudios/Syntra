import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import {
  ArrowUpRight, ArrowLeft, Check, CheckCircle2, CircleHelp, Copy,
  Download, FileText, Globe, LockKeyhole, Mail, Phone, RotateCw,
  Send, ShieldCheck, Sparkles, Workflow, XCircle, ChevronDown,
} from 'lucide-react';
import {
  briefCompleteness, EMPTY_FIELDS, formatProjectBrief, HANDOFF_LABELS,
  safeContactHref, type Brief,
  type ContactOption,
} from '@workspace/consultation';
import { useAdvisor } from '@/lib/advisor';
import { useRuntime } from '@/lib/runtime-context';
import { useGetBrief, useListContactOptions } from '@/lib/runtime-hooks';
import { AdvisorOrb } from '@/components/advisor-ui';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useHandoffEnquiry } from '@/lib/use-handoff-enquiry';

const CONTACT_ICONS = { link: Globe, email: Mail, phone: Phone } as const;

type Feedback = 'idle' | 'copied' | 'copy-error' | 'downloaded';

function downloadMarkdown(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function StatusLabel({ status }: { status?: 'confirmed' | 'suggested' | 'manual' }) {
  if (!status) return null;
  return (
    <span className={cn(
      'rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.12em]',
      status === 'manual' ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' :
      status === 'confirmed' ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' :
      'border-blue-300/20 bg-blue-300/10 text-blue-200'
    )}>
      {status === 'manual' ? 'Edited' : status}
    </span>
  );
}

function Dossier({ brief }: { brief: Brief | undefined }) {
  const completion = brief ? briefCompleteness(brief) : { complete: 0, total: 8, suggested: 0 };
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [expanded, setExpanded] = useState(desktop);
  useEffect(() => setExpanded(desktop), [desktop]);
  return (
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="group/dossier relative overflow-hidden rounded-[22px] glass edge-light p-4 sm:p-5" aria-label="Project dossier">
      <summary className="relative flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden" data-testid="button-toggle-dossier">
        <div className="flex items-center gap-3">
          <AdvisorOrb size={36} live />
          <div>
            <div className="flex items-center gap-2 font-display text-[13px] tracking-tight text-foreground">PROJECT DOSSIER <ChevronDown className="h-3.5 w-3.5 text-primary/70 transition-transform group-open/dossier:rotate-180" /></div>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[.22em] text-muted-foreground">Live consultation data</p>
          </div>
        </div>
        <div className="shrink-0 text-right" data-testid="status-handoff-completeness">
          <span className="font-display text-xl font-light text-primary">{completion.complete}</span>
          <span className="font-mono text-[11px] text-muted-foreground"> / {completion.total}</span>
          <div className="mt-1 font-mono text-[9px] text-muted-foreground">FIELDS FILLED</div>
        </div>
      </summary>
      <div className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-[65px]" />
      <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuenow={completion.complete} aria-valuemin={0} aria-valuemax={completion.total} aria-label="Project details established">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500" initial={false} animate={{ width: String(100 * completion.complete / completion.total) + '%' }} transition={{ duration: .55 }} />
      </div>
      {completion.complete > 0 ? <div className="mt-4 grid grid-cols-2 gap-2">
        {HANDOFF_LABELS.map(([key, label]) => {
          const value = brief?.[key];
          return (
            <div key={key} className={cn('min-w-0 rounded-xl border border-white/[.065] bg-black/15 px-3 py-2.5', (key === 'objective' || key === 'requirements') && 'col-span-2')} data-testid={'handoff-field-' + key}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                <span className="font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">{label}</span>
                <StatusLabel status={brief?.provenance[key]?.status} />
              </div>
              <p className={cn('whitespace-pre-wrap break-words text-[12px] leading-relaxed', value ? 'text-foreground/90' : 'italic text-muted-foreground/60')}>
                {value || 'Awaiting detail'}
              </p>
            </div>
          );
        })}
      </div> : <p className="mt-4 text-xs leading-relaxed text-foreground/60">Start a consultation to build your eight-field brief. No project details have been assumed.</p>}
      <Link href={completion.complete > 0 ? '/brief' : '/'} className="mt-4 inline-flex items-center gap-2 text-[12px] font-medium text-primary transition-colors hover:text-cyan-100" data-testid="link-review-brief">
        {completion.complete > 0 ? 'Review and edit your brief' : 'Start in Discover'} <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </details>
  );
}

export default function Book() {
  const { scope } = useRuntime();
  const { conversationId } = useAdvisor();
  return <BookWorkspace key={JSON.stringify([scope, conversationId])} />;
}

function BookWorkspace() {
  const { conversationId, conversation } = useAdvisor();
  const { runtime } = useRuntime();
  const id = conversationId ?? 0;
  const { data: brief, isLoading: briefLoading, isError: briefError, refetch: reloadBrief } = useGetBrief(id);
  const { data: contacts, isLoading: contactsLoading, isError: contactsError, refetch: reloadContacts } = useListContactOptions();
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const enquiry = useHandoffEnquiry(id);
  const [consent, setConsent] = useState(enquiry.attempt?.input.consent ?? false);
  const [name, setName] = useState(enquiry.attempt?.input.name ?? '');
  const [email, setEmail] = useState(enquiry.attempt?.input.email ?? '');
  const [note, setNote] = useState(enquiry.attempt?.input.note ?? '');
  const receipt = enquiry.receipt;

  const markdown = useMemo(
    () => brief ? formatProjectBrief(brief, { title: conversation?.title ? 'Digital Prodigy — ' + conversation.title : undefined }) : '',
    [brief, conversation?.title],
  );
  const safeContacts = useMemo(
    () => (contacts ?? []).map(contact => ({ ...contact, safeHref: safeContactHref(contact) }))
      .filter((contact): contact is ContactOption & { safeHref: string } => Boolean(contact.safeHref)),
    [contacts],
  );
  const hasScopedBrief = Boolean(brief && briefCompleteness(brief).complete > 0);
  const hasGateway = Boolean(runtime.booking.submitEnquiry);
  const canSubmit = Boolean(id && (brief?.objective?.trim() || enquiry.attempt) && hasGateway);
  const activeSubmit = enquiry.submitting;
  useEffect(() => setFeedback('idle'), [brief?.revision]);

  async function copyBrief() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setFeedback('copied');
    } catch {
      setFeedback('copy-error');
    }
  }

  function downloadBrief() {
    if (!markdown) return;
    downloadMarkdown(markdown, 'syntra-project-brief.md');
    setFeedback('downloaded');
  }

  async function submitEnquiry() {
    if (!brief || !id || !runtime.booking.submitEnquiry || activeSubmit) return;
    const fields = HANDOFF_LABELS.reduce((acc, [key]) => {
      acc[key] = brief[key];
      return acc;
    }, { ...EMPTY_FIELDS });
    await enquiry.submit({
      conversationId: id, briefRevision: brief.revision,
      brief: fields, name, email, note, consent,
    });
  }

  const updateDetails = (update: () => void) => {
    update();
  };

  return (
    <div className="relative isolate min-w-0 pb-6" data-testid="syntra-handoff">
      <div className="pointer-events-none absolute -left-10 top-0 -z-10 h-64 w-[60%] rounded-full bg-cyan-400/[.045] blur-[90px]" />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.33em] text-primary/80">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_rgba(103,232,249,.7)]" /> 04 / Human handoff
          </p>
          <h1 className="font-display text-[clamp(1.5rem,3.2vw,2.6rem)] font-light leading-[1.2] tracking-[-.055em]">
            From clarity <span className="text-ember">to action.</span>
          </h1>
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-foreground/60">
            Take your working brief into a real conversation. You decide what leaves this session.
          </p>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/[.065] px-3 py-2 font-mono text-[9px] uppercase tracking-[.18em] text-primary/90 sm:flex">
          <ShieldCheck className="h-3.5 w-3.5" /> Permission first
        </span>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2" aria-label="Handoff stages">
        {[
          { number: '01', label: 'Scope' },
          { number: '02', label: 'Review' },
          { number: '03', label: 'Connect' },
        ].map((step, i) => (
          <div key={step.number} className={cn(
            'flex items-center gap-2 rounded-xl border px-3 py-2',
            i === 2 ? 'border-primary/25 bg-primary/[.06]' : 'border-white/[.06] bg-white/[.018]'
          )}>
            <span className={cn('font-mono text-[10px]', i === 2 ? 'text-primary' : 'text-muted-foreground')}>{step.number}</span>
            <span className="text-[11px] text-foreground/80">{step.label}</span>
            {i === 0 && hasScopedBrief && <Check className="ml-auto h-3 w-3 text-cyan-300/70" />}
          </div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.92fr)]">
        <div className="space-y-4">
          <motion.section
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}
            className="relative overflow-hidden rounded-[22px] glass edge-light p-4 sm:rounded-[26px] sm:p-5"
          >
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-blue-500/10 blur-[60px]" />
            <div className="relative flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/[.08] text-primary">
                <Workflow className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="font-display text-[14px] tracking-tight">Your next move</h2>
                <p className="mt-1 hidden text-[13px] leading-relaxed text-foreground/60 sm:block">
                  A clear, portable summary—not a lengthy transcript or a speculative quote.
                </p>
              </div>
            </div>
            <div className="relative mt-3 rounded-2xl border border-primary/[.13] bg-gradient-to-br from-cyan-400/[.06] via-transparent to-blue-500/[.055] p-3 sm:mt-5 sm:p-4">
              <div className="mb-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.2em] text-primary/70">
                <FileText className="h-3.5 w-3.5" /> Prepared project brief
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/85">
                {brief?.objective || 'Your project objective will appear as the consultation develops.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyBrief()} disabled={!hasScopedBrief}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[.1] px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/[.17] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="button-copy-handoff">
                  {feedback === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {feedback === 'copied' ? 'Copied' : 'Copy brief'}
                </button>
                <button type="button" onClick={downloadBrief} disabled={!brief}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-foreground/85 transition hover:border-white/25 hover:bg-white/[.04] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="button-download-handoff">
                  <Download className="h-3.5 w-3.5" /> Export .md
                </button>
              </div>
              {feedback === 'copy-error' && <p role="alert" className="mt-3 text-xs text-amber-200">Clipboard access is unavailable. Export the Markdown file instead.</p>}
              {feedback === 'downloaded' && <p role="status" className="mt-3 text-xs text-cyan-200/80">Markdown export prepared locally on your device.</p>}
            </div>
            <p className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground sm:mt-4 sm:text-[11px]">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Copying or exporting does not send anything to Digital Prodigy.
            </p>
          </motion.section>

          <section className="overflow-hidden rounded-[22px] glass p-4 sm:rounded-[26px] sm:p-5" aria-label="Connect with Digital Prodigy">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-blue-300/25 bg-blue-400/[.08] text-blue-300">
                <Send className="h-4.5 w-4.5" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="font-display text-[14px] tracking-tight">Connect with the team</h2>
                <p className="mt-1 text-xs text-foreground/55">Only approved channels appear here.</p>
              </div>
            </div>

            {contactsLoading && <div className="mt-5 space-y-2">{[0,1].map(i=><div key={i} className="h-14 animate-pulse rounded-xl bg-white/[.035]" />)}</div>}
            {contactsError && <button onClick={() => void reloadContacts()} className="mt-4 flex items-center gap-2 text-sm text-amber-200" data-testid="button-retry-handoff-contacts"><RotateCw className="h-3.5 w-3.5" /> Try loading channels again</button>}
            {!contactsLoading && !contactsError && safeContacts.length === 0 && !hasGateway && (
              <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/[.018] p-4" data-testid="status-handoff-unconfigured">
                <div className="flex gap-3">
                  <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200/80" />
                  <div>
                    <p className="text-[13px] font-medium text-foreground/90">Secure handoff not connected yet</p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/55">
                      No verified booking or enquiry destination is available. Your brief stays in this session; you can copy or export it now.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {hasGateway && !canSubmit && <p className="mt-4 text-xs leading-relaxed text-foreground/65">Add a clear objective in <Link href="/brief" className="text-primary underline">Project Brief</Link> before submitting a reviewed enquiry.</p>}
            {safeContacts.length > 0 && (
              <div className="mt-5 grid gap-2">
                {safeContacts.map(contact => {
                  const Icon = CONTACT_ICONS[contact.kind];
                  return (
                    <a key={contact.id} href={contact.safeHref}
                      target={contact.kind === 'link' ? '_blank' : undefined}
                      rel={contact.kind === 'link' ? 'noopener noreferrer' : undefined}
                      className="group flex items-center gap-3 rounded-2xl border border-white/[.09] bg-black/10 px-4 py-3 transition hover:border-primary/35 hover:bg-primary/[.045]"
                      data-testid={'link-approved-contact-' + contact.id}>
                      <Icon className="h-4 w-4 shrink-0 text-primary/80" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-foreground">{contact.label}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{contact.detail}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-primary/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </a>
                  );
                })}
                <p className="text-[10px] leading-relaxed text-muted-foreground">Opening a contact channel is not a confirmed appointment or submitted enquiry.</p>
              </div>
            )}

            {canSubmit && brief && (
              <div className="mt-5 space-y-3" data-testid="form-syntra-enquiry">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-primary/75">
                  <Sparkles className="h-3.5 w-3.5" /> Connected enquiry
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-foreground/75">Your name
                    <input value={name} onChange={event => updateDetails(() => setName(event.target.value))}
                      maxLength={120} autoComplete="name" disabled={enquiry.locked}
                      className="mt-1.5 block w-full rounded-xl border border-white/[.13] bg-black/20 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60"
                      data-testid="input-handoff-name" />
                  </label>
                  <label className="text-xs text-foreground/75">Email address
                    <input type="email" value={email} onChange={event => updateDetails(() => setEmail(event.target.value))}
                      maxLength={254} autoComplete="email" disabled={enquiry.locked}
                      className="mt-1.5 block w-full rounded-xl border border-white/[.13] bg-black/20 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60"
                      data-testid="input-handoff-email" />
                  </label>
                </div>
                <label className="block text-xs text-foreground/75">Anything else the team should know? <span className="text-muted-foreground">(optional)</span>
                  <textarea rows={2} value={note} maxLength={2000} disabled={enquiry.locked}
                    onChange={event => updateDetails(() => setNote(event.target.value))}
                    className="mt-1.5 block w-full resize-y rounded-xl border border-white/[.13] bg-black/20 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60"
                    data-testid="input-handoff-note" />
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[.08] bg-black/15 px-3 py-3 text-[12px] leading-relaxed text-foreground/70">
                  <input type="checkbox" checked={consent} disabled={enquiry.locked}
                    onChange={event => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-300" data-testid="checkbox-handoff-consent" />
                  I have reviewed my project brief and consent to sharing the brief and my contact details with Digital Prodigy for this enquiry.
                </label>
                {enquiry.locked && !enquiry.confirmed && <p className="text-xs leading-relaxed text-foreground/65" data-testid="status-handoff-pending">Receipt is not yet confirmed. Retry keeps the original request ID and reviewed details. Your consented request is saved only in this browser tab for recovery.</p>}
                {enquiry.attempt && brief.revision !== enquiry.attempt.input.briefRevision && <p role="status" className="text-xs text-amber-200">Your brief has changed. This attempt still uses the previously reviewed revision {enquiry.attempt.input.briefRevision}; it will not silently send your newer edits.</p>}
                <button type="button" onClick={() => void submitEnquiry()} disabled={!consent || activeSubmit || enquiry.confirmed || enquiry.storageBlocked}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 px-5 py-3 text-sm font-semibold text-[#040816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="button-submit-enquiry">
                  {activeSubmit ? 'Requesting confirmation…' : enquiry.confirmed ? 'Receipt confirmed' : enquiry.locked ? 'Retry reviewed enquiry' : 'Send reviewed enquiry'}
                  <ArrowUpRight className="h-4 w-4" />
                </button>
                {enquiry.error && <p role="alert" className="flex items-start gap-2 text-xs text-amber-200" data-testid="status-handoff-error"><XCircle className="h-4 w-4 shrink-0" />{enquiry.error}</p>}
                {enquiry.confirmed && receipt && (
                  <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[.06] p-3" data-testid="status-handoff-confirmed">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-200" />
                    <div><p className="text-sm text-emerald-100">The connected provider confirmed receipt.</p>
                    <p className="mt-1 font-mono text-[11px] text-emerald-200/75">Reference: {receipt.reference}</p></div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-3">
          {briefLoading && <div className="h-80 animate-pulse rounded-[26px] glass" />}
          {briefError && <button onClick={() => void reloadBrief()} className="flex items-center gap-2 text-sm text-amber-200"><RotateCw className="h-4 w-4" /> Retry project brief</button>}
          {!briefLoading && !briefError && <Dossier brief={brief} />}
          <div className="rounded-2xl border border-white/[.07] bg-black/[.13] px-4 py-3">
            <p className="flex items-center gap-2 text-[12px] font-medium text-foreground/80">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> No invented commitments
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Recommendations are provisional. No price, delivery schedule or availability is guaranteed by this brief.
            </p>
          </div>
          <Link href="/brief" className="inline-flex items-center gap-2 px-2 text-xs text-muted-foreground transition hover:text-primary" data-testid="link-back-to-brief">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to your project brief
          </Link>
        </div>
      </div>
    </div>
  );
}
