import { Link } from 'wouter';
import { AdvisorOrb } from '@/components/advisor-ui';

export default function NotFound() {
  return (
    <div className="flex flex-col items-start py-16">
      <AdvisorOrb size={64} />
      <div className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Signal lost / 404</div>
      <h1 className="mt-3 font-display text-4xl font-light tracking-tight">This coordinate is empty.</h1>
      <p className="mt-3 max-w-md text-foreground/65">Nothing has been built here. Head back and tell the advisor what should be.</p>
      <Link href="/" className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground" data-testid="link-back-home">Return to Discover</Link>
    </div>
  );
}
