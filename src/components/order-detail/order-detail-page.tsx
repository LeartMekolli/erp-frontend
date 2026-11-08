"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { noAnswer } from "@/components/auth/copy";
import { Freshness } from "@/components/data/freshness";
import { RecordPaymentDialog } from "@/components/orders/record-payment-dialog";
import { ShipDialog } from "@/components/orders/ship-dialog";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { isApiProblem } from "@/lib/api/problem";
import { can } from "@/lib/auth/permissions";
import { useOrder } from "@/lib/orders/queries";
import { OfflineError } from "@/lib/session/client-session";

import { LinePanel } from "./line-panel";
import { CancelledBanner, OrderHeader } from "./order-header";
import { PaymentPanel } from "./payment-panel";
import { NotePanel, ShippingPanel } from "./shipping-panel";

/** `/orders/:id`: one order, and everything staff can do with it. */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "order.read")) notFound();
  return <OrderDetail id={id} />;
}

function Message({ children }: { children: ReactNode }) {
  return <section className="flex flex-col items-start gap-3 rounded-[20px] bg-card px-6 py-7">{children}</section>;
}

function BackToOrders() {
  return (
    <Button asChild variant="link" className="self-start">
      <Link href="/orders">Back to Orders</Link>
    </Button>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading the order" className="flex flex-col gap-3.5 pt-1">
      <div className="h-16 w-72 animate-pulse rounded-2xl bg-card motion-reduce:animate-none" />
      <div className="grid gap-3.5 xl:grid-cols-[1fr_340px]">
        <div className="h-96 animate-pulse rounded-[20px] bg-card motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-[20px] bg-card motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function OrderDetail({ id }: { id: string }) {
  const query = useOrder(id);
  const [shipping, setShipping] = useState(false);
  const [paying, setPaying] = useState(false);
  // What the last action did, announced politely.
  const [notice, setNotice] = useState<string | null>(null);

  if (query.isPending) return <Loading />;

  if (!query.data) {
    if (isApiProblem(query.error) && query.error.status === 404) {
      return (
        <Message>
          <h1 className="text-title font-semibold">This order doesn&apos;t exist</h1>
          <p className="text-sm text-ink-2">It may have been a mistyped link.</p>
          <BackToOrders />
        </Message>
      );
    }
    const message =
      query.error instanceof OfflineError
        ? noAnswer()
        : (isApiProblem(query.error) && query.error.detail) || "This order couldn't be loaded.";
    return (
      <Message>
        <p className="text-sm text-ink">{message}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </Message>
    );
  }

  const order = query.data;
  return (
    <>
      <OrderHeader
        order={order}
        onShip={() => {
          setNotice(null);
          setShipping(true);
        }}
        onRecordPayment={() => {
          setNotice(null);
          setPaying(true);
        }}
      />
      {order.cancelled && <CancelledBanner cancelled={order.cancelled} />}

      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-caption font-medium text-ink">
          {notice}
        </p>
        <Freshness query={query} />
      </div>

      <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Lines" className="flex min-w-0 flex-col gap-3.5">
          {[...order.lines]
            .sort((a, b) => a.position - b.position)
            .map((line, index) => (
              <LinePanel key={line.id} line={line} order={order} now={query.dataUpdatedAt} index={index} />
            ))}
        </section>
        <div className="flex min-w-0 flex-col gap-3.5">
          <PaymentPanel order={order} />
          <ShippingPanel order={order} onNotice={setNotice} />
          {order.note && <NotePanel note={order.note} />}
        </div>
      </div>

      <ShipDialog order={order} open={shipping} onOpenChange={setShipping} onShipped={setNotice} />
      <RecordPaymentDialog order={order} open={paying} onOpenChange={setPaying} onRecorded={setNotice} />
    </>
  );
}
