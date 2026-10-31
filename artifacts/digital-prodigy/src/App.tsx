import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { memoryLocation } from 'wouter/memory-location';
import type { ConsultationRuntime } from '@workspace/consultation';
import { SyntraRuntimeProvider } from '@/lib/runtime-context';
import { queryClient } from '@/lib/query-client';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Discover from '@/pages/discover';
import Solutions from '@/pages/solutions';
import { DeferredPage } from '@/lib/route-pages';
import { Shell } from '@/components/shell';
import { AdvisorProvider } from '@/lib/advisor';
import { Route, Switch, Router as WouterRouter } from 'wouter';


function Router() {
  return (
    <Shell>
      {/* each page container renders with the location it was created for, so the outgoing page
          keeps its own content while it fades out instead of briefly showing the incoming one */}
      {(location) => (
      <ErrorBoundary resetKey={location}>
        <Switch location={location}>
          <Route path="/" component={Discover} />
          <Route path="/solutions" component={Solutions} />
          <Route path="/brief">{() => <DeferredPage path="/brief" />}</Route>
          <Route path="/book">{() => <DeferredPage path="/book" />}</Route>
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
      )}
    </Shell>
  );
}

function App({ nativeRuntime, scope = 'replit' }: { nativeRuntime?: ConsultationRuntime; scope?: string } = {}) {
  const [client] = useState(() => nativeRuntime ? new QueryClient() : queryClient);
  const [location] = useState(() => memoryLocation().hook);
  const content = (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <WouterRouter base={nativeRuntime ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')} {...(nativeRuntime ? { hook: location } : {})}>
          <AdvisorProvider><Router /></AdvisorProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
  if (nativeRuntime) return <SyntraRuntimeProvider runtime={nativeRuntime} scope={scope} initialConversationId={1} native>{content}</SyntraRuntimeProvider>;
  return (
    content
  );
}

export default App;
