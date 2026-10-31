import { motion } from 'framer-motion';
import { ArrowUpRight, Globe, Mail, Phone, ShieldAlert, RotateCw } from 'lucide-react';
import { useGetBrief, useListContactOptions } from '@/lib/runtime-hooks';
import { useAdvisor } from '@/lib/advisor';
import { BriefHandoff } from '@/components/brief-handoff';
import { Constellation } from '@/components/constellation';

const ICON = { link: Globe, email: Mail, phone: Phone } as const;

export default function Book() {
  const { data, isLoading, isError, refetch } = useListContactOptions();
  const { conversationId } = useAdvisor();
  const { data: brief } = useGetBrief(conversationId ?? 0);
  return (
    <div>
      <div className="mb-8">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-ion">04 / Handoff</div>
        <h1 className="font-display text-3xl font-light tracking-[-0.03em] sm:text-[2.75rem] sm:leading-[1.05]">Continue with <span className="text-ember glow-text">a human.</span></h1>
        <p className="mt-3 max-w-xl text-foreground/65">Take your brief to the Digital Prodigy team through their verified channels.</p>
      </div>

      <div className="mb-6 flex gap-3 rounded-2xl border border-ion/25 bg-[linear-gradient(135deg,hsl(217_95%_60%/.08),transparent)] p-4 text-sm leading-relaxed text-foreground/80" data-testid="text-booking-notice">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ion" />
        This advisor has no connected calendar. It cannot book or confirm a time, submit an enquiry, or send a message on your behalf.
      </div>

      {brief && <div className="mb-5"><BriefHandoff brief={brief} compact /></div>}

      {isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-secondary/40 animate-pulse" />)}</div>}
      {isError && <button onClick={() => refetch()} className="flex items-center gap-2 text-destructive" data-testid="button-retry-contacts"><RotateCw className="h-4 w-4" /> Contact options failed to load. Retry</button>}
      {data && data.length === 0 && <p className="text-muted-foreground" data-testid="status-no-contacts">Verified contact channels have not been connected yet. Your brief remains saved in this session.</p>}

      <div className="space-y-3">
        {data?.map((c, i) => {
          const Icon = ICON[c.kind] ?? Globe;
          return (
            <motion.a
              key={c.id}
              href={c.href}
              target={c.kind === 'link' ? '_blank' : undefined}
              rel="noreferrer"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              data-testid={`link-contact-${c.id}`}
              className="group flex items-center gap-4 sweep edge-light rounded-[24px] glass p-5 transition-all hover:shadow-[0_0_0_1px_hsl(187_92%_69%/.35),0_20px_60px_-20px_hsl(214_95%_55%/.55)]"
            >
              <div className="relative grid h-12 w-12 place-items-center rounded-2xl border border-primary/30 bg-[linear-gradient(160deg,hsl(187_92%_69%/.14),hsl(217_95%_60%/.08))] text-primary transition-shadow duration-500 group-hover:shadow-[0_0_24px_-4px_hsl(187_92%_69%/.6)]"><Constellation seed={i + 11} className="absolute -inset-3 opacity-40 transition-opacity duration-500 group-hover:opacity-100" /><Icon className="relative h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.label}</div>
                <div className="truncate text-sm text-muted-foreground">{c.detail}</div>
              </div>
              <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </motion.a>
          );
        })}
      </div>
    </div>
  );
}
