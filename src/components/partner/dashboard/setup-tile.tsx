"use client";

import { Check } from "lucide-react";

import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import { usePartnerMe } from "@/components/session/use-partner-me";
import { partnerRoleAtLeast, usePartnerRole } from "@/lib/auth/permissions";
import { usePartnerSetup } from "@/lib/partner-dashboard/queries";
import { usePayoutAccount } from "@/lib/partner-earnings/queries";

import { useWorkshop } from "../use-workshop";

import { setupSteps } from "./setup-steps";

/**
 * What the workshop still has to set up before it gets offers, as a checklist; done and to do are words,
 * not only a tick. Admins and owners also see the payout account, which only they may read.
 */
export function SetupTile() {
  const { partnerId, suspended } = useWorkshop();
  const role = usePartnerRole(partnerId);
  const seesAccount = role !== undefined && partnerRoleAtLeast(role, "admin");
  const status = usePartnerMe().data?.partners.find((partner) => partner.id === partnerId)?.status;
  const setup = usePartnerSetup(partnerId);
  const account = usePayoutAccount(partnerId, { enabled: seesAccount, checking: false });

  const accountKnown = !seesAccount || account.data !== undefined;
  const steps =
    setup.data && status && role && accountKnown ? setupSteps(setup.data, status, seesAccount ? (account.data?.state ?? null) : null) : null;
  const done = steps?.filter((step) => step.done).length ?? 0;

  return (
    <Tile
      span={seesAccount ? 3 : 4}
      title="Setup still to finish"
      aside={steps ? <span className="text-caption text-ink-2">{`${done} of ${steps.length}`}</span> : undefined}
    >
      {suspended ? <p className="mt-2 text-sm font-medium text-warn">Suspended by staff: you can read, but not change anything.</p> : null}
      {steps ? (
        done === steps.length ? (
          <p className="mt-3 text-sm text-ink-2">All set up.</p>
        ) : (
          <ul role="list" className="mt-3 flex flex-col gap-2.5">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-2.5 text-sm">
                {step.done ? (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-violet text-white">
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-lilac-2" />
                )}
                <span className={step.done ? "min-w-0 flex-1 text-ink-2" : "min-w-0 flex-1 font-medium text-ink"}>{step.label}</span>
                {step.done ? <span className="sr-only">Done</span> : <span className="shrink-0 text-caption text-ink-2">To do</span>}
              </li>
            ))}
          </ul>
        )
      ) : setup.isError ? (
        <LoadFailure error={setup.error} fallback="Couldn't load your setup." onRetry={() => void setup.refetch()} />
      ) : account.isError ? (
        <LoadFailure error={account.error} fallback="Couldn't load your payout account." onRetry={() => void account.refetch()} />
      ) : (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading your setup…
        </p>
      )}
    </Tile>
  );
}
