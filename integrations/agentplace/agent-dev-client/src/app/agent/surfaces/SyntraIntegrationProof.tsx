import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGroup, MotionConfig } from 'framer-motion';
import type { A2uiNodeViewProps } from '../../lib/a2ui/catalog';
import { useSyntraViewport } from '../../lib/stage/SyntraViewportContext';
import { SyntraPortalProvider } from '../syntra-app/frontend/lib/portal-context';
import SyntraApp from '../syntra-app/frontend/App';
import { syntraStyles } from '../syntra-app/styles.generated';

const fonts = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;500;600&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

/** Pinned source app in the native surface tree; Shadow DOM scopes its original CSS. */
export function SyntraDashboard(_props: A2uiNodeViewProps) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const group = useId();
  const viewport = useSyntraViewport();
  const setExpanded = viewport?.setExpanded;
  const mount = useCallback((host: HTMLDivElement | null) => {
    if (host) setShadow(host.shadowRoot ?? host.attachShadow({ mode: 'open' }));
  }, []);

  useEffect(() => {
    setExpanded?.(true);
    return () => setExpanded?.(false);
  }, [setExpanded]);

  return (
    <div ref={mount} className="h-full min-h-0 w-full" data-testid="syntra-dashboard-host">
      {shadow ? createPortal(
        <>
          <link rel="stylesheet" href={fonts} />
          <style>{syntraStyles}</style>
          <div className="syntra-original h-full w-full">
            <MotionConfig reducedMotion="user">
              <LayoutGroup id={group}>
                <SyntraPortalProvider value={shadow}>
                  <SyntraApp />
                </SyntraPortalProvider>
              </LayoutGroup>
            </MotionConfig>
          </div>
        </>,
        shadow,
      ) : null}
    </div>
  );
}
