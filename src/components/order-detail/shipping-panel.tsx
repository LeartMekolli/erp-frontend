"use client";

import { useState } from "react";

import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { isApiProblem } from "@/lib/api/problem";
import type { Order } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";
import { useMarkDelivered } from "@/lib/orders/queries";
import { OfflineError } from "@/lib/session/client-session";

import { Panel } from "./payment-panel";

type TrackingStatus = NonNullable<NonNullable<Order["shipping"]["label"]>["tracking_status"]>;

const TRACKING: Record<TrackingStatus, string> = {
  pre_transit: "Label created",
  in_transit: "On its way",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returned: "Returned",
  failure: "Delivery failed",
  unknown: "Status unknown",
};

/** Where the order goes, how, and how far it has got. */
export function ShippingPanel({ order, onNotice }: { order: Order; onNotice: (message: string) => void }) {
  const { data: me } = useMe();
  const { date } = useFormat();
  const deliver = useMarkDelivered(order.id);
  const [failure, setFailure] = useState<string | null>(null);
  const { shipping, address } = order;
  const label = shipping.label;

  const markDelivered = async () => {
    setFailure(null);
    try {
      await deliver.mutateAsync();
      onNotice(`#${order.number} marked delivered.`);
    } catch (error) {
      if (error instanceof OfflineError) setFailure(noAnswer());
      else setFailure((isApiProblem(error) && error.detail) || UNKNOWN);
    }
  };

  return (
    <Panel title="Shipping">
      <p className="text-sm font-semibold">{shipping.method.name}</p>
      <address className="text-sm break-words text-ink-2 not-italic">
        {address.name}
        <br />
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.postal_code} {address.city}
        {address.region && `, ${address.region}`}, {address.country}
        {address.phone && (
          <>
            <br />
            {address.phone}
          </>
        )}
      </address>
      {(shipping.courier || shipping.tracking) && (
        <p className="text-sm break-words">
          {[shipping.courier, shipping.tracking].filter(Boolean).join(" · ")}
        </p>
      )}
      {label && (
        <p className="text-caption text-ink-2">
          <a href={label.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
            Shipping label
          </a>
          {label.tracking_status && ` · ${TRACKING[label.tracking_status]}`}
        </p>
      )}
      {shipping.shipped_at && <p className="text-caption text-ink-2">Shipped {date(shipping.shipped_at)}</p>}
      {shipping.delivered_at && <p className="text-caption text-ink-2">Delivered {date(shipping.delivered_at)}</p>}
      {order.state === "shipped" && can(me, "order.ship") && (
        <Button variant="secondary" className="self-start rounded-full" disabled={deliver.isPending} onClick={() => void markDelivered()}>
          Mark delivered
        </Button>
      )}
      {failure && (
        <p role="alert" className="text-caption font-medium text-ink">
          {failure}
        </p>
      )}
    </Panel>
  );
}

/** What was noted when the order was placed. */
export function NotePanel({ note }: { note: string }) {
  return (
    <Panel title="Note">
      <p className="text-sm break-words whitespace-pre-line">{note}</p>
    </Panel>
  );
}
