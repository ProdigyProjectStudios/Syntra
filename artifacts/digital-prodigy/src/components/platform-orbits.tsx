import { AdvisorOrb } from '@/components/advisor-ui';

const platforms = [
  { name: 'AgentOps', label: 'AO', href: 'https://agentops.digitalprodigy.dev/', hue: 80 },
  { name: 'Digital Prodigy', label: 'DP', href: 'https://digitalprodigy.dev/', hue: -15 },
  { name: 'IntegrationOS', label: 'IO', href: 'https://integrationos.digitalprodigy.dev/demo?view=studio', hue: -15 },
];

export function PlatformOrbits() {
  return <nav aria-label="Digital Prodigy platforms" className="flex shrink-0 flex-col items-center pt-2 lg:-ml-[72px]">
    <div className="flex items-center gap-5" data-testid="platform-orbs">
      {platforms.map((platform, index) =>
          <a key={platform.name} href={platform.href} target="_blank" rel="noopener noreferrer" aria-label={`${platform.name} (opens in a new tab)`}
            className="group flex flex-col items-center gap-1.5 rounded-xl focus-visible:outline focus-visible:outline-primary">
            <span className="relative grid h-11 w-11 place-items-center rounded-full border border-white/[.08] bg-white/[.02] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-white/25">
            <span className="relative">
              <span className="block" style={{ filter: `hue-rotate(${platform.hue}deg) saturate(1.8)` }}><AdvisorOrb size={index === 1 ? 32 : 26} live={false} /></span>
              {platform.label === 'IO' && <span className="pointer-events-none absolute inset-0" style={{ filter: 'hue-rotate(80deg) saturate(1.8)', maskImage: 'linear-gradient(125deg, transparent 15%, black 80%)' }}><AdvisorOrb size={26} live={false} /></span>}
            </span>
            <span className="pointer-events-none absolute inset-1 rounded-full border border-white/10 [transform:rotateX(65deg)_rotate(-25deg)]" />
            </span>
            <span className="font-mono text-[10px] tracking-[.2em] text-white/65">{platform.label}</span>
          </a>
      )}
    </div>
    <p className="mt-2 font-mono text-[8px] uppercase tracking-[.28em] text-white/45 [text-shadow:0_0_6px_#ffffff80,0_0_16px_#ffffff40]">Solving Expensive Problems</p>
  </nav>;
}
