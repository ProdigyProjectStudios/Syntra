import { QueryClient } from '@tanstack/react-query';

/** Lives in its own module so hot-reloading App.tsx never swaps the cache out from under live hooks. */
export const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });
