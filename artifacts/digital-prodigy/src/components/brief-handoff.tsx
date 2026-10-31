import { Copy, Download, FileJson2, FileText, ShieldCheck } from 'lucide-react';
import {
  assessHandoff, createHandoffPacket, formatHandoffJSON, formatHandoffMarkdown, handoffFileName,
} from '@workspace/consultation';
import type { Brief } from '@workspace/consultation';
import { useToast } from '@/hooks/use-toast';

type Props = { brief: Brief; compact?: boolean };

function downloadContent(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Allow browsers to initiate the download before releasing the object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

/**
 * This panel never transmits visitor data. It exports only the current scoped
 * brief, on a direct user gesture. The native host retains authority for
 * booking, handoff, permissions, sessions and AI responses.
 */
export function BriefHandoff({ brief, compact = false }: Props) {
  const { toast } = useToast();
  const readiness = assessHandoff(brief);
  const enabled = readiness.established > 0;

  const copy = async () => {
    if (!enabled) return;
    try {
      const text = formatHandoffMarkdown(createHandoffPacket(brief));
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      toast({ title: 'Brief copied', description: 'Ready to paste wherever you choose.' });
    } catch {
      toast({ title: 'Could not copy', description: 'Use Download Markdown instead. Nothing was sent.' });
    }
  };

  const save = (extension: 'md' | 'json') => {
    if (!enabled) return;
    try {
      const now = new Date();
      const packet = createHandoffPacket(brief, now);
      downloadContent(
        extension === 'md' ? formatHandoffMarkdown(packet) : formatHandoffJSON(packet),
        handoffFileName(extension, now),
        extension === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      );
      toast({ title: 'Brief downloaded', description: 'Your project details remain under your control.' });
    } catch {
      toast({ title: 'Download failed', description: 'Your project brief was not changed or submitted.' });
    }
  };

  return (
    <section
      aria-label="Prepare a project handoff"
      data-testid="syntra-brief-handoff"
      className="relative overflow-hidden rounded-[22px] border border-primary/20 bg-[linear-gradient(130deg,hsl(188_80%_64%/.07),hsl(221_46%_11%/.5)_60%,transparent)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.7} aria-hidden="true" />
            <h2 className="font-display text-base font-medium tracking-tight">Your handoff packet</h2>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {readiness.established}/{readiness.total} fields
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">
            {readiness.status === 'ready_for_discussion'
              ? 'Enough context for an initial discussion. Suggested details still need your review.'
              : readiness.status === 'not_started'
                ? 'Tell the advisor what you are planning before exporting.'
                : 'A working draft. Unanswered questions will remain clearly marked.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Brief export controls">
          <button type="button" disabled={!enabled} onClick={() => void copy()}
            data-testid="button-copy-brief"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
          </button>
          <button type="button" disabled={!enabled} onClick={() => save('md')}
            data-testid="button-download-brief-md"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> <Download className="h-3 w-3" aria-hidden="true" /> Markdown
          </button>
          <button type="button" disabled={!enabled} onClick={() => save('json')}
            data-testid="button-download-brief-json"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40">
            <FileJson2 className="h-3.5 w-3.5" aria-hidden="true" /> JSON
          </button>
        </div>
      </div>

      {!compact && readiness.openQuestions.length > 0 && enabled && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/45">Decisions still open</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {readiness.openQuestions.slice(0, 3).map(({ key, question }) => (
              <span key={key} title={question} className="max-w-full truncate rounded-full border border-border bg-background/35 px-2.5 py-1 text-[11px] text-foreground/65">
                {question}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
        Local download only. This does not submit an enquiry, quote a price or book a call.
      </p>
    </section>
  );
}
