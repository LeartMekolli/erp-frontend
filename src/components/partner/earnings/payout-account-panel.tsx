"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { Button } from "@/components/ui/button";
import { isApiProblem } from "@/lib/api/problem";
import type { PartnerRole, PayoutAccountState } from "@/lib/api/schema-types";
import { usePayoutAccount, usePayoutLink } from "@/lib/partner-earnings/queries";
import { useNow } from "@/lib/use-now";

import { usePartnerNotice } from "../notice";

/** After the provider sends the owner back, the account is checked for this long. */
const CHECK_MS = 60_000;

const WORDS: Record<Exclude<PayoutAccountState, "ready">, { words: string; button: string }> = {
  not_connected: { words: "Set up payouts so the workspace can pay you.", button: "Set up payouts" },
  onboarding: { words: "Your payout setup isn't finished, so the workspace can't pay you yet.", button: "Finish setup" },
  restricted: { words: "The payment provider needs more details before you can be paid.", button: "Update details" },
};

function linkError(error: unknown): string {
  if (isApiProblem(error) && error.status === 409) return "The workspace hasn't set up payments yet. Ask them to.";
  return (isApiProblem(error) && error.detail) || "The setup link couldn't be made. Try again.";
}

function Panel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[20px] bg-card px-4 py-3 text-sm text-ink md:px-5">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

const alertIcon = <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-collect" />;

/**
 * Whether the workshop can be paid, above everything else on Earnings: nothing once the payout account
 * is ready, otherwise what's missing. Only the owner can get the provider's link, never while suspended.
 * `onboarding` is how the provider sent the owner back: `done` checks the account for a minute, since
 * its new state arrives by webhook; `expired` says the link ran out.
 */
export function PayoutAccountPanel({
  partnerId,
  role,
  suspended,
  onboarding,
  go = (url) => window.location.assign(url),
}: {
  partnerId: string;
  role: PartnerRole;
  suspended: boolean;
  onboarding: "done" | "expired" | null;
  go?: (url: string) => void;
}) {
  const [openedAt] = useState(Date.now);
  const now = useNow(1_000);
  const checking = onboarding === "done" && now - openedAt < CHECK_MS;
  const account = usePayoutAccount(partnerId, { enabled: true, checking });
  const link = usePayoutLink(partnerId);
  const { announce } = usePartnerNotice();
  const state = account.data?.state;

  const asking = useRef(false);
  const [leaving, setLeaving] = useState(false);

  // Back from the provider, the browser may show this page again from its cache, still leaving: undo that.
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      asking.current = false;
      setLeaving(false);
    };
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, []);

  // Back from the provider and ready: say so once, in the notice line.
  const announced = useRef(false);
  useEffect(() => {
    if (onboarding === "done" && state === "ready" && !announced.current) {
      announced.current = true;
      announce("Payouts are set up.");
    }
  }, [onboarding, state, announce]);

  if (account.isError && !state) {
    return <LoadFailure error={account.error} fallback="Your payout account couldn't be loaded." onRetry={() => void account.refetch()} />;
  }
  if (!state || state === "ready") return null;

  if (checking) {
    return (
      <div role="status">
        <Panel icon={<LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-violet motion-reduce:animate-none" />}>
          <p>Checking your payout account…</p>
        </Panel>
      </div>
    );
  }

  const expired = onboarding === "expired";
  const { words, button } = WORDS[state];
  const owner = role === "owner";
  // One link per visit: a click while one is being asked for, or once the browser is on its way to the
  // provider, does nothing. Each link works once, so a second would only replace the first.
  const getLink = () => {
    if (asking.current) return;
    asking.current = true;
    link.mutate(undefined, {
      onSuccess: (url) => {
        setLeaving(true);
        go(url);
      },
      onError: () => {
        asking.current = false;
      },
    });
  };

  return (
    <div role="status">
      <Panel icon={alertIcon}>
        <p>{expired ? "That setup link ran out." : words}</p>
        {expired && <p className="text-ink-2">{words}</p>}
        {!owner && <p className="text-ink-2">Your workshop&apos;s owner can do this.</p>}
        {owner && !suspended && (
          <Button className="self-start" disabled={link.isPending || leaving} aria-busy={link.isPending || leaving} onClick={getLink}>
            {expired ? "Get a new link" : button}
          </Button>
        )}
        {link.isError && <p className="text-late-ink">{linkError(link.error)}</p>}
      </Panel>
    </div>
  );
}
