import { cn } from '@/lib/utils';

/** Restrained CSS-only thinking signal: a fine light orbiting a hairline ring, plus a running trace. */
export function ThinkingIndicator({ label = 'Thinking', className }: { label?: string; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn('thinking-indicator inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary/75', className)}>
      <span aria-hidden="true" className="ti-orbit"><span className="ti-dot" /></span>
      <span>{label}</span>
      <span aria-hidden="true" className="ti-trace"><span /></span>
    </span>
  );
}
