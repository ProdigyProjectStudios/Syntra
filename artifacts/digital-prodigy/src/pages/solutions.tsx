import { motion } from 'framer-motion';
import { ArrowUpRight, Cpu, LayoutDashboard, Workflow, Gem, RotateCw } from 'lucide-react';
import { useListServices } from '@workspace/api-client-react';
import { useAdvisor } from '@/lib/advisor';
import { Constellation } from '@/components/constellation';

const ICONS = [Cpu, LayoutDashboard, Workflow, Gem];
/* teal to electric blue: each direction sits at a different point on the same signal */
const HUES = ['187 92% 69%', '217 95% 66%', '174 78% 58%', '199 95% 64%'];

export default function Solutions() {
  const { data, isLoading, isError, refetch } = useListServices();
  const { send, sending } = useAdvisor();

  return (
    <div>
      <div className="mb-8">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-ion">05 / Directions</div>
        <h1 className="font-display text-3xl font-light tracking-[-0.03em] sm:text-[2.75rem] sm:leading-[1.05]">Four ways to build. <span className="text-ember glow-text">Pick a vector.</span></h1>
        <p className="mt-3 max-w-xl text-foreground/65">Choose a direction and the advisor will open that thread. Or ignore all four and describe the idea in your own words.</p>
      </div>

      {isLoading && <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-56 rounded-3xl bg-secondary/40 animate-pulse" />)}</div>}
      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <p>Service directory did not load.</p>
          <button onClick={() => refetch()} className="mt-3 flex items-center gap-2 text-sm font-semibold text-destructive" data-testid="button-retry-services"><RotateCw className="h-4 w-4" /> Retry</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((s, i) => {
          const Icon = ICONS[i % 4];
          const hue = HUES[i % 4];
          return (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.985 }}
              disabled={sending}
              data-testid={`card-service-${s.id}`}
              onClick={() => send(`I'd like to explore ${s.name}. What would a first build look like for me?`)}
              className={`group relative overflow-hidden sweep edge-light rounded-[28px] glass p-6 text-left transition-shadow duration-500 hover:shadow-[0_30px_80px_-30px_hsl(var(--h)/.55)] disabled:opacity-60 ${i === 0 ? 'md:row-span-1' : ''}`}
              style={{ ['--h' as string]: hue }}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-70" style={{ background: `radial-gradient(circle, hsl(${hue} / .6), transparent 70%)` }} />
              <Constellation seed={i + 3} hue={hue} className="pointer-events-none absolute -right-4 -top-4 h-44 w-56 opacity-35 transition-opacity duration-700 group-hover:opacity-100" />
              <div className="relative flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border" style={{ borderColor: `hsl(${hue} / .35)`, background: `hsl(${hue} / .1)`, color: `hsl(${hue})` }}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">0{i + 1}</span>
              </div>
              <h2 className="relative mt-5 font-display text-lg font-medium tracking-tight">{s.name}</h2>
              <p className="relative mt-1 text-sm" style={{ color: `hsl(${hue})` }}>{s.tagline}</p>
              <p className="relative mt-3 text-sm leading-relaxed text-foreground/65">{s.description}</p>
              <div className="relative mt-4 flex flex-wrap gap-1.5">
                {s.capabilities.map((c) => (
                  <span key={c} className="rounded-full border border-border bg-background/40 px-2.5 py-1 font-mono text-[10px] text-foreground/70">{c}</span>
                ))}
              </div>
              <div className="relative mt-5 flex items-center gap-2 text-sm font-semibold opacity-70 transition-opacity group-hover:opacity-100" style={{ color: `hsl(${hue})` }}>
                Explore with the advisor <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
