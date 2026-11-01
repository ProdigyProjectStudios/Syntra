import { AdvisorOrb } from '@/components/advisor-ui';

const platforms = [
  { name: 'AgentOps', label: 'AO', href: 'https://agentops.digitalprodigy.dev/', hue: 125 },
  { name: 'Digital Prodigy', label: 'DP', href: 'https://digitalprodigy.dev/', hue: 195 },
  { name: 'IntegrationOS', label: 'IO', href: 'https://integrationos.digitalprodigy.dev/demo?view=studio', hue: 285 },
];

export function PlatformOrbits() {
  return <nav aria-label="Digital Prodigy platforms" className="flex shrink-0 flex-col items-center pt-2">
    <div className="flex items-center gap-5">
      {platforms.map((platform, index) =>
          <a key={platform.name} href={platform.href} target="_blank" rel="noopener noreferrer" aria-label={`${platform.name} (opens in a new tab)`}
            className="group flex flex-col items-center gap-1.5 rounded-xl focus-visible:outline focus-visible:outline-primary">
            <span className="relative grid h-11 w-11 place-items-center rounded-full border border-white/[.08] bg-white/[.02] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-white/25">
            <span style={{ filter: `hue-rotate(${platform.hue}deg)` }}><AdvisorOrb size={index === 1 ? 32 : 26} live={false} /></span>
            <span className="pointer-events-none absolute inset-1 rounded-full border border-white/10 [transform:rotateX(65deg)_rotate(-25deg)]" />
            </span>
            <span className="font-mono text-[10px] tracking-[.2em] text-white/65">{platform.label}</span>
          </a>
      )}
    </div>
    <p className="mt-2 font-mono text-[8px] uppercase tracking-[.28em] text-white/45">Solving Expensive Problems</p>
  </nav>;
}
