"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { leaveAuthNote } from "@/lib/auth/auth-note";
import { createQueryClient } from "@/lib/query/query-client";

import { clientSession } from "./client-session";

/**
 * Wraps the app: TanStack Query, activity tracking, and the move to the
 * sign-in page when the session ends in this tab or another.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    const session = clientSession();
    const stopWatching = session.watch();
    const stopListening = session.onSessionEnded((reason) => {
      queryClient.clear();
      // After a deliberate sign-out, the next person shouldn't land on this page.
      leaveAuthNote(reason === "signed-out" ? { reason } : { reason, next: window.location.pathname + window.location.search });
      router.replace("/sign-in");
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
