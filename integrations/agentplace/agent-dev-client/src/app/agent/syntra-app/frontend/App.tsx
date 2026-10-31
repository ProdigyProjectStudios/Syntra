import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { ErrorBoundary } from './components/error-boundary';
import { Toaster } from './components/ui/toaster';
import { TooltipProvider } from './components/ui/tooltip';
import NotFound from './pages/not-found';
import Discover from './pages/discover';
import Solutions from './pages/solutions';
import BriefPage from './pages/brief';
import Book from './pages/book';
import { Shell } from './components/shell';
import { AdvisorProvider } from './lib/advisor';

function Router() {
  return (
    <Shell>
      {(location) => (
        <ErrorBoundary resetKey={location}>
          <Switch location={location}>
            <Route path="/" component={Discover} />
            <Route path="/solutions" component={Solutions} />
            <Route path="/brief" component={BriefPage} />
            <Route path="/book" component={Book} />
            <Route component={NotFound} />
          </Switch>
        </ErrorBoundary>
      )}
    </Shell>
  );
}

/** Original Syntra app tree; native Agentplace context supplies its session and runtime. */
export default function SyntraApp() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
  }));
  const [useSyntraLocation] = useState(() => memoryLocation().hook);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter hook={useSyntraLocation}>
          <AdvisorProvider><Router /></AdvisorProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
