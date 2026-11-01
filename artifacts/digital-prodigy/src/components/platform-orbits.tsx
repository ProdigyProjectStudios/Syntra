import { AdvisorOrb } from '@/components/advisor-ui';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const platforms = [
  { name: 'AgentOps', href: 'https://agentops.digitalprodigy.dev/', hue: 125 },
  { name: 'Digital Prodigy', href: 'https://digitalprodigy.dev/', hue: 195 },
  { name: 'IntegrationOS', href: 'https://integrationos.digitalprodigy.dev/demo?view=studio', hue: 285 },
];

export function PlatformOrbits() {
  return <nav aria-label="Digital Prodigy platforms" className="flex shrink-0 flex-col items-center pt-2">
    <div className="flex items-center gap-5">
      {platforms.map((platform, index) => <Tooltip key={platform.name}>
        <TooltipTrigger asChild>
          <a href={platform.href} target="_blank" rel="noopener noreferrer" aria-label={`${platform.name} (opens in a new tab)`}
            className="group relative grid h-11 w-11 place-items-center rounded-full border border-white/[.08] bg-white/[.02] transition duration-300 hover:-translate-y-0.5 hover:border-white/25 focus-visible:outline focus-visible:outline-primary">
            <span style={{ filter: `hue-rotate(${platform.hue}deg)` }}><AdvisorOrb size={index === 1 ? 32 : 26} live={false} /></span>
            <span className="pointer-events-none absolute inset-1 rounded-full border border-white/10 [transform:rotateX(65deg)_rotate(-25deg)]" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={10} className="rounded-xl border-white/10 bg-[#080d1b]/95 px-4 py-2 text-xs tracking-wide backdrop-blur-xl">{platform.name}</TooltipContent>
      </Tooltip>)}
    </div>
    <p className="mt-2 font-mono text-[8px] uppercase tracking-[.28em] text-white/45">Solving Expensive Problems</p>
  </nav>;
}
