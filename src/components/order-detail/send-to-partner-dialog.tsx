"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { workspaceToday } from "@/lib/orders/labels";
import { useEligiblePartners, useOfferJob } from "@/lib/partners/queries";

import { DIALOG_SHEET } from "./dialog-classes";
import { LoadFailure } from "./load-failure";
import { PartnerChoices } from "./partner-choices";
import { submitErrorText } from "./submit-error";

const schemaFor = (today: string) =>
  z.object({
    // A radio group nobody has touched reads as null.
    partnerId: z.string({ error: "Choose a partner." }).min(1, "Choose a partner."),
    dueOn: z.string().refine((day) => day === "" || day >= today, "Pick today or a later day."),
  });
type Values = z.infer<ReturnType<typeof schemaFor>>;

interface SendProps {
  groupId: string;
  lineTitle: string;
  currency: string;
  onSent: (message: string) => void;
}

/** Offers a line to a partner who can take it, at a cost frozen when it's sent. */
export function SendToPartnerDialog({ open, onOpenChange, ...form }: SendProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHEET}>
        <SendForm
          {...form}
          onSent={(message) => {
            onOpenChange(false);
            form.onSent(message);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SendForm({ groupId, lineTitle, currency, onSent }: SendProps) {
  const { data: me } = useMe();
  const today = workspaceToday(me?.workspace.timezone ?? "UTC");
  const eligible = useEligiblePartners(groupId, true);
  const offer = useOfferJob();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schemaFor(today)), defaultValues: { partnerId: "", dueOn: "" } });

  const onSubmit = async (values: Values) => {
    setMessage(null);
    try {
      await offer.mutateAsync({ groupId, body: { partner_id: values.partnerId, ...(values.dueOn ? { due_on: values.dueOn } : {}) } });
    } catch (error) {
      setMessage(submitErrorText(error));
      return;
    }
    onSent(`Offered to ${eligible.data?.data.find((row) => row.partner.id === values.partnerId)?.partner.name ?? "the partner"}.`);
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold break-words">{`Send ${lineTitle} to a partner`}</DialogTitle>
        <DialogDescription className="text-sm text-ink-2">The cost is frozen when you send it, and the partner has until the deadline to answer.</DialogDescription>
      </div>
      {eligible.isPending ? (
        <div role="status" aria-label="Loading the partners" className="h-32 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
      ) : !eligible.data ? (
        <LoadFailure error={eligible.error} fallback="The partners couldn't be loaded." onRetry={() => void eligible.refetch()} />
      ) : (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
          {message && <FormMessage tone="error">{message}</FormMessage>}
          <fieldset disabled={offer.isPending} className="flex flex-col gap-4">
            <PartnerChoices eligible={eligible.data} currency={currency} field={register("partnerId")} error={errors.partnerId?.message} />
            <Field id="send-due-on" label="Due by (optional)" hint="Left empty, it follows the order's promised date." error={errors.dueOn?.message}>
              {(props) => <Input {...props} {...register("dueOn")} type="date" min={today} />}
            </Field>
            <Button type="submit" className="mt-1" disabled={eligible.data.data.length === 0}>
              {offer.isPending ? "Sending…" : "Send offer"}
            </Button>
          </fieldset>
        </form>
      )}
    </>
  );
}
