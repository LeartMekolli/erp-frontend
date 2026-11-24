"use client";

import { useQuery } from "@tanstack/react-query";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { noAnswer, UNKNOWN } from "@/components/auth/copy";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/schema-types";
import { markSignedOut } from "@/lib/auth/auth-note";
import { leaveArrivalNote } from "@/lib/navigation/arrival-note";
import { resolveDestination } from "@/lib/auth/destination";
import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";
import { OfflineError, SessionEndedError, clientSession } from "@/lib/session/client-session";

export type Area = "staff" | "partner";

/** `GET /me`, shared by the gate and the pages behind it. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MeResponse> => {
      const { data, response } = await api.GET("/me");
      if (!data) throw new Error(`/me answered ${response.status}`);
      return data;
    },
  });
}

function readCookie(name: string): string | null {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

// AMI's own pages have no query; this keeps one added outside AMI (the payment provider's `?onboarding=`).
const here = () => window.location.pathname + window.location.search;

/** Whether this person may be in this area, and on this workshop's pages. */
function allowed(me: MeResponse, area: Area, partnerId: string | undefined): boolean {
  const destination = resolveDestination(me);
  if (area === "staff") return destination.kind === "staff";
  if (destination.kind === "partner") return !partnerId || partnerId === destination.partnerId;
  if (destination.kind === "choose-partner") return !partnerId || destination.partnerIds.includes(partnerId);
  return false;
}

/**
 * Lets a page render only for someone signed in to this area. Restores the
 * session from AMI's cookie (a reload, or an email link), sends people with no
 * session to sign-in and back, and shows not-found to the wrong kind of user.
 * Idle, 12-hour and revoked sign-outs are SessionProvider's to redirect.
 */
export function SessionGate({ area, children }: { area: Area; children: ReactNode }) {
  const router = useRouter();
  const { partnerId } = useParams<{ partnerId?: string }>();
  const me = useMe();

  // A link for another workspace than this session's (spec §5.5): sign out, then sign in there.
  const hint = me.data ? readCookie(WORKSPACE_HINT_COOKIE) : null;
  const otherWorkspace = hint !== null && me.data !== undefined && hint !== me.data.workspace.slug;

  const noSession = me.error instanceof SessionEndedError && me.error.reason === "none";

  useEffect(() => {
    if (!noSession) return;
    leaveArrivalNote("/sign-in", { next: here() });
    router.replace("/sign-in");
  }, [noSession, router]);

  useEffect(() => {
    if (!otherWorkspace || !hint) return;
    void clientSession().signOut("signed-out", { quiet: true });
    leaveArrivalNote("/sign-in", { workspace: hint, next: here() });
    // Its session cookie may not be cleared yet: the sign-in page mustn't send it home.
    markSignedOut();
    router.replace("/sign-in");
  }, [otherWorkspace, hint, router]);

  if (me.error && !(me.error instanceof SessionEndedError)) {
    return (
      <Centred>
        <div className="flex w-full max-w-[360px] flex-col gap-4">
          <FormMessage tone="error">{me.error instanceof OfflineError ? noAnswer() : UNKNOWN}</FormMessage>
          <Button variant="secondary" onClick={() => void me.refetch()}>
            Try again
          </Button>
        </div>
      </Centred>
    );
  }

  if (!me.data || otherWorkspace) {
    return (
      <Centred>
        <p role="status" className="text-sm text-ink-2">
          Loading AMI…
        </p>
      </Centred>
    );
  }

  if (!allowed(me.data, area, partnerId)) notFound();

  return children;
}

function Centred({ children }: { children: ReactNode }) {
  return <main className="grid flex-1 place-items-center p-6">{children}</main>;
}
