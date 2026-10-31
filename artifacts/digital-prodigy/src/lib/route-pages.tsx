import { useEffect, useState, type ComponentType } from 'react';

const loaders = {
  '/book': () => import('@/pages/book'),
  '/brief': () => import('@/pages/brief'),
};
type DeferredPath = keyof typeof loaders;
const pages = new Map<string, ComponentType>();
const requests = new Map<string, Promise<void>>();
const isDeferred = (location: string): location is DeferredPath =>
  Object.hasOwn(loaders, location);

function prepareRoute(location: string): Promise<void> {
  if (!isDeferred(location) || pages.has(location)) return Promise.resolve();
  const path = location;
  let request = requests.get(path);
  if (!request) {
    request = loaders[path]().then(
      (module) => { pages.set(path, module.default); },
      (error) => { requests.delete(path); throw error; },
    );
    requests.set(path, request);
  }
  return request;
}

/** Only advance the animated page after its code is available. No blank exit/enter gap. */
export function useReadyRoute(location: string) {
  const [readyLocation, setReadyLocation] = useState<string | null>(() =>
    isDeferred(location) && !pages.has(location) ? null : location);
  useEffect(() => {
    let current = true;
    // A rejected import enters an explicit recovery state instead of getting stuck.
    void prepareRoute(location).then(
      () => { if (current) setReadyLocation(location); },
      () => { if (current) setReadyLocation(location); },
    );
    return () => { current = false; };
  }, [location]);
  return readyLocation;
}

export function DeferredPage({ path }: { path: DeferredPath }) {
  const Page = pages.get(path);
  if (!Page) return (
    <div role="alert" className="py-6 text-sm text-muted-foreground">
      This view could not load. Check your connection, then reload the app.
      {/* Failed ES modules can remain cached for this document. Re-importing the
          same URL is not a reliable retry, including in a native host bundle. */}
      <button className="ml-3 text-primary underline" onClick={() => window.location.reload()}>Reload app</button>
    </div>
  );
  return <Page />;
}
