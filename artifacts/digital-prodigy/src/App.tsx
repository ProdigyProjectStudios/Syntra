import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Discover from '@/pages/discover';
import Solutions from '@/pages/solutions';
import BriefPage from '@/pages/brief';
import Book from '@/pages/book';
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
          <Route path="/brief" component={BriefPage} />
          <Route path="/book" component={Book} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
      )}
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AdvisorProvider>
            <Router />
          </AdvisorProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
