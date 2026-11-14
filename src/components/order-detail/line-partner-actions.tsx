"use client";

import { useState } from "react";

import { submitErrorText } from "@/components/production/submit-error";
import { Button } from "@/components/ui/button";
import type { Order, OrderLine, OrderPart, OrderState } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { partnerStatus } from "@/lib/orders/line-partner";
import { useWithdrawOffer } from "@/lib/partners/queries";

import { MovePartnerDialog } from "./move-partner-dialog";
import { SendToPartnerDialog } from "./send-to-partner-dialog";

const CLOSED: OrderState[] = ["shipped", "delivered", "cancelled"];

/** erp-api's refusal for an order whose production hasn't started (`orders/payment-hold.ts:7`). */
const WAITING_FOR_PAYMENT = "The order is waiting for payment";

/** What staff can do about who has a line: send it out, take back an offer, or move it. */
export function LinePartnerActions({ line, order, now, title }: { line: OrderLine | OrderPart; order: Order; now: number; title: string }) {
  const mayAssign = useCan("partner.assign");
  const withdraw = useWithdrawOffer();
  const [dialog, setDialog] = useState<"send" | "move" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // An assembly's own group is put together in-house, so no partner can take it (`partners/eligibility.service.ts:42`).
  const assembly = "parts" in line && line.parts.length > 0;
  const groupId = line.group_id;
  if (!mayAssign || !groupId || assembly || line.state !== "in_production" || CLOSED.includes(order.state)) return null;

  const status = partnerStatus(line.partner, now);
  const waiting = order.state === "awaiting_payment";
  const canSend = status.kind === "in_house" || status.kind === "offer_expired";

  const withdrawOffer = async () => {
    setNotice(null);
    try {
      await withdraw.mutateAsync(groupId);
      setNotice("Offer withdrawn.");
    } catch (error) {
      setNotice(submitErrorText(error));
    }
  };

  return (
    <>
      {canSend && (
        <Button type="button" variant="outline" disabled={waiting} onClick={() => setDialog("send")}>
          Send to partner
        </Button>
      )}
      {status.kind === "offered" && (
        <Button type="button" variant="outline" disabled={withdraw.isPending} onClick={() => void withdrawOffer()}>
          Withdraw offer
        </Button>
      )}
      {status.kind === "accepted" && line.partner && (
        <Button type="button" variant="outline" disabled={waiting} onClick={() => setDialog("move")}>
          Move to another partner
        </Button>
      )}
      {waiting && (canSend || status.kind === "accepted") && <span className="text-caption text-ink-2">{WAITING_FOR_PAYMENT}</span>}
      <p role="status" className="text-caption font-medium text-ink empty:hidden">
        {notice}
      </p>

      {dialog === "send" && (
        <SendToPartnerDialog open groupId={groupId} lineTitle={title} currency={order.currency} onOpenChange={() => setDialog(null)} onSent={setNotice} />
      )}
      {dialog === "move" && line.partner && (
        <MovePartnerDialog
          open
          groupId={groupId}
          lineTitle={title}
          currency={order.currency}
          current={{ id: line.partner.id, name: line.partner.name }}
          onOpenChange={() => setDialog(null)}
          onMoved={setNotice}
        />
      )}
    </>
  );
}
