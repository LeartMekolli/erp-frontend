"use client";

import { Check } from "lucide-react";

import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import { submitErrorText } from "@/components/production/submit-error";
import { usePartnerMe } from "@/components/session/use-partner-me";
import { Button } from "@/components/ui/button";
import { partnerRoleAtLeast, usePartnerRole } from "@/lib/auth/permissions";
import { usePartnerSetup, useSubmitSetup } from "@/lib/partner-dashboard/queries";
import { usePayoutAccount } from "@/lib/partner-earnings/queries";

import { useWorkshop } from "../use-workshop";

import { setupSteps, type SetupStep } from "./setup-steps";

/**
 * What the workshop still has to set up before it gets offers, as a checklist; done, to do and waiting are
 * words, not only a tick. Admins and owners also see the payout account, which only they may read. Only the
 * owner may submit the setup (`setup.controller.ts:229`), once everything before it is done.
 */
export function SetupTile() {
  const { partnerId, suspended } = useWorkshop();
  const role = usePartnerRole(partnerId);
  const seesAccount = role !== undefined && partnerRoleAtLeast(role, "admin");
  const partner = usePartnerMe().data?.partners.find((one) => one.id === partnerId);
  const setup = usePartnerSetup(partnerId);
  const account = usePayoutAccount(partnerId, { enabled: seesAccount, checking: false });
  const submit = useSubmitSetup(partnerId);

  const accountKnown = !seesAccount || account.data !== undefined;
  const steps =
    setup.data && partner && role && accountKnown
      ? setupSteps(setup.data, { status: partner.status, submittedAt: partner.submitted_at }, seesAccount ? (account.data?.state ?? null) : null)
      : null;
  const done = steps?.filter((step) => step.done).length ?? 0;
  const readyToSubmit = (index: number) => steps !== null && steps.slice(0, index).every((step) => step.done);
  const submitAction = (step: SetupStep, index: number) => {
    if (step.key !== "submitted" || step.done || partner?.status !== "setting_up") return null;
    if (role === "owner" && !suspended && readyToSubmit(index))
      return (
        <Button disabled={submit.isPending} onClick={() => submit.mutate()} className="shrink-0">
          Submit for approval
        </Button>
      );
    if (role === "admin") return <span className="shrink-0 text-caption text-ink-2">Your owner sends this</span>;
    return null;
  };

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
            {steps.map((step, index) => (
              <li key={step.key} className="flex flex-wrap items-center gap-2.5 text-sm">
                {step.done ? (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-violet text-white">
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-lilac-2" />
                )}
                <span className={step.done ? "min-w-0 flex-1 text-ink-2" : "min-w-0 flex-1 font-medium text-ink"}>{step.label}</span>
                {step.done ? (
                  <span className="sr-only">Done</span>
                ) : (
                  (submitAction(step, index) ?? <span className="shrink-0 text-caption text-ink-2">{step.waiting ? "Waiting" : "To do"}</span>)
                )}
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
      {/* Under the list, not in the step's row: after a refusal the tile reads erp-api again and may show "All set up.". */}
      {submit.isError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-late-ink">
          {submitErrorText(submit.error)}
        </p>
      ) : null}
    </Tile>
  );
}
