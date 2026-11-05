import { QueryClient } from "@tanstack/react-query";

import { OfflineError, SessionEndedError } from "@/lib/session/client-session";

/** Screens refetch their data this often while the tab is visible. */
export const REFRESH_INTERVAL_MS = 60_000;

/**
 * The app's TanStack Query client: data refetches every minute and when the
 * tab regains focus or the browser comes back online, never while the tab is
 * hidden. Refetches are background work, never activity (spec §5.4).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval: REFRESH_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        staleTime: 30_000,
        retry: (count, error) =>
          !(error instanceof SessionEndedError) && !(error instanceof OfflineError) && count < 2,
      },
      // A submit is retried by the person, with the same Idempotency-Key.
      mutations: { retry: false },
    },
  });
}
