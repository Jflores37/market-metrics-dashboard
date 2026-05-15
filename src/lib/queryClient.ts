import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Backend cron jobs refresh data every 10 min to daily; no need to
      // refetch every time the tab regains focus.
      refetchOnWindowFocus: false,
      // Consider data fresh for 5 minutes, then refetch on next render.
      staleTime: 5 * 60 * 1000,
      // Keep results in memory 10 min so tab switches are instant.
      gcTime: 10 * 60 * 1000,
      // One retry on transient errors (e.g. brief network blip).
      retry: 1,
    },
  },
});
