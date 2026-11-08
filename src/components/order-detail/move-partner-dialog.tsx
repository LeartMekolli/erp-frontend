"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEligiblePartners, useReassignJob } from "@/lib/partners/queries";

import { LoadFailure } from "./load-failure";
import { PartnerChoices } from "./partner-choices";
import { submitErrorText } from "./submit-error";

// erp-api's rules (`partners/jobs.service.ts:26`, `:36-45`).
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const schema = z
  .object({
    partnerId: z.string({ error: "Choose a partner." }).min(1, "Choose a partner."),
    amount: z.string().trim().refine((amount) => amount === "" || MONEY.test(amount), "Enter an amount such as 40.00."),
    reason: z.string().trim().max(500, "Use at most 500 characters."),
  })
  .superRefine((values, context) => {
    if (values.amount && !values.reason) context.addIssue({ code: "custom", path: ["reason"], message: "Say why they're owed this." });
  });
type Values = z.infer<typeof schema>;

interface MoveProps {
  groupId: string;
  lineTitle: string;
  currency: string;
  current: { id: string; name: string };
  onMoved: (message: string) => void;
}

/** Moves an accepted line to another partner, and says what the last one is owed. */
export function MovePartnerDialog({ open, onOpenChange, ...form }: MoveProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <MoveForm
          {...form}
          onMoved={(message) => {
            onOpenChange(false);
            form.onMoved(message);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({ groupId, lineTitle, currency, current, onMoved }: MoveProps) {
  const eligible = useEligiblePartners(groupId, true);
  const reassign = useReassignJob();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { partnerId: "", amount: "", reason: "" } });
  const others = eligible.data?.data.filter((row) => row.partner.id !== current.id) ?? [];

  const onSubmit = async (values: Values) => {
    setMessage(null);
    try {
      await reassign.mutateAsync({
        groupId,
        body: { partner_id: values.partnerId, ...(values.amount ? { previous_owed: { amount: values.amount, reason: values.reason } } : {}) },
      });
    } catch (error) {
      setMessage(submitErrorText(error));
      return;
    }
    onMoved(`Moved to ${others.find((row) => row.partner.id === values.partnerId)?.partner.name ?? "the new partner"}.`);
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold break-words">{`Move ${lineTitle} to another partner`}</DialogTitle>
        <DialogDescription className="text-sm text-ink-2">{`The new partner has it at once, so arrange it with them first. ${current.name} is owed nothing unless you enter an amount.`}</DialogDescription>
      </div>
      {eligible.isPending ? (
        <div role="status" aria-label="Loading the partners" className="h-32 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
      ) : !eligible.data ? (
        <LoadFailure error={eligible.error} fallback="The partners couldn't be loaded." onRetry={() => void eligible.refetch()} />
      ) : (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
          {message && <FormMessage tone="error">{message}</FormMessage>}
          <fieldset disabled={reassign.isPending} className="flex flex-col gap-4">
            <PartnerChoices eligible={eligible.data} exceptId={current.id} currency={currency} field={register("partnerId")} error={errors.partnerId?.message} />
            <Field id="move-owed" label={`Owed to ${current.name} (optional)`} hint="For the work they've already done." error={errors.amount?.message}>
              {(props) => <Input {...props} {...register("amount")} inputMode="decimal" autoComplete="off" />}
            </Field>
            <Field id="move-owed-reason" label="Reason" error={errors.reason?.message}>
              {(props) => <Textarea {...props} {...register("reason")} maxLength={500} />}
            </Field>
            <Button type="submit" className="mt-1" disabled={others.length === 0}>
              {reassign.isPending ? "Moving…" : "Move job"}
            </Button>
          </fieldset>
        </form>
      )}
    </>
  );
}
