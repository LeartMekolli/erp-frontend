"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { OfflineError, SessionEndedError, clientSession } from "./client-session";

/**
 * Wraps the app: TanStack Query, activity tracking, and the move to the
 * sign-in page when the session ends in this tab or another.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) =>
              !(error instanceof SessionEndedError) && !(error instanceof OfflineError) && count < 2,
          },
        },
      }),
  );

  useEffect(() => {
    const session = clientSession();
    const stopWatching = session.watch();
    const stopListening = session.onSessionEnded((reason) => {
      queryClient.clear();
      const params = new URLSearchParams({ reason });
      // After a deliberate sign-out, the next person shouldn't land on this page.
      if (reason !== "signed-out") params.set("next", window.location.pathname + window.location.search);
      router.replace(`/sign-in?${params}`);
    });
    return () => {
      stopWatching();
      stopListening();
    };
  }, [router, queryClient]);

  // Moving between pages is activity; so is loading one.
  useEffect(() => {
    clientSession().recordActivity();
  }, [pathname]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
