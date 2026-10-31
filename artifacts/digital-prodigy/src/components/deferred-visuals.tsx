import { useEffect, useState, type ComponentType } from 'react';

type VisualProps = { energy: number; paused: boolean };

/** Keep canvas setup and its animation loops off the first-render critical path. */
export function DeferredVisuals(props: VisualProps) {
  const [Visuals, setVisuals] = useState<ComponentType<VisualProps> | null>(null);
  useEffect(() => {
    let active = true;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      void import('./visual-effects').then(
        (module) => { if (active) setVisuals(() => module.VisualEffects); },
        (error) => { console.error('Syntra visual effects could not load', error); },
      );
    };
    // Two frames let the shell paint before idle work is eligible.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if ('requestIdleCallback' in window) idle = window.requestIdleCallback(load, { timeout: 1200 });
        else timer = setTimeout(load, 200);
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);
  return Visuals ? <Visuals {...props} /> : null;
}
