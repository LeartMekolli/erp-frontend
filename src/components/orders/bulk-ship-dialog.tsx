"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";

import { Field } from "@/components/auth/field";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Order, ShipBody } from "@/lib/api/schema-types";
import { invalidateOrders } from "@/lib/orders/queries";

import { canShip } from "./order-row-menu";
import { chunksOf, shipChunks, type BatchResult, type Chunk } from "./ship-batch";
import { ShipChoice } from "./ship-choice";

type Choice = "mark" | "label";

const ordersText = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

/**
 * Ships the selected orders that are ready (spec §6.3): marked as shipped
 * with one optional courier for all, or with a label bought for each. Any
 * number, in requests of 25 one after another, with progress, then which
 * shipped and which didn't. "Try again" resends a request that got no answer
 * as it was, with its key, and orders refused on their own in a new request.
 * Closing stops new requests, refetches the list, and hands back what shipped.
 */
export function BulkShipDialog({
  orders,
  open,
  onOpenChange,
  onShipped,
}: {
  orders: readonly Order[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShipped: (ids: string[]) => void;
}) {
  const client = useQueryClient();
  const { data: me } = useMe();
  // Labels need the workspace's courier service (`/me`); until that's known, only marking is offered.
  const labelsOffered = me?.workspace.labels_available ?? false;
  const [picked, setChoice] = useState<Choice>("mark");
  const choice: Choice = labelsOffered ? picked : "mark";
  const [courier, setCourier] = useState("");
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  // How many orders the dialog set out to ship: its title from then on.
  const [sent, setSent] = useState(0);
  const [progress, setProgress] = useState({ done: 0, of: 0 });
  // The latest result for each order sent.
  const [results, setResults] = useState<ReadonlyMap<string, BatchResult>>(new Map());
  // Requests that got no answer: they go again as they were, with their keys.
  const unanswered = useRef<Chunk[]>([]);
  const body = useRef<ShipBody>({});
  const controller = useRef<AbortController | null>(null);

  const ready = orders.filter(canShip);
  const skipped = orders.length - ready.length;
  const outcomes = [...results.values()];
  const shipped = outcomes.filter((r) => r.ok);
  const labels = shipped.flatMap((r) => (r.ok && r.labelUrl ? [{ id: r.id, number: r.number, url: r.labelUrl }] : []));
  const failed = outcomes.flatMap((r) => (r.ok ? [] : [r]));

  async function run(chunks: readonly Chunk[]) {
    const abort = new AbortController();
    controller.current = abort;
    unanswered.current = [];
    let stale = false;
    setPhase("running");
    setProgress({ done: 0, of: chunks.reduce((sum, chunk) => sum + chunk.orders.length, 0) });
    await shipChunks(chunks, body.current, {
      signal: abort.signal,
      onChunk: (outcome) => {
        const settled: BatchResult[] = outcome.answered
          ? outcome.results
          : outcome.chunk.orders.map(({ id, number }) => ({ id, number, ok: false, message: outcome.message, stale: false }));
        if (!outcome.answered) unanswered.current.push(outcome.chunk);
        if (settled.some((r) => !r.ok && r.stale)) stale = true;
        setResults((current) => {
          const next = new Map(current);
          for (const result of settled) next.set(result.id, result);
          return next;
        });
        setProgress((current) => ({ ...current, done: current.done + outcome.chunk.orders.length }));
      },
    });
    // Closed mid-way, or an order had moved on: show the list as it is now.
    if (abort.signal.aborted || stale) void invalidateOrders(client);
    if (!abort.signal.aborted) setPhase("done");
  }

  function start() {
    const name = courier.trim();
    body.current = choice === "label" ? { label: {} } : name ? { courier: name } : {};
    setSent(ready.length);
    void run(chunksOf(ready.map(({ id, number }) => ({ id, number }))));
  }

  /** Unanswered requests again with their keys; orders refused on their own in new requests. */
  function retry() {
    const pending = new Set(unanswered.current.flatMap((chunk) => chunk.orders.map((order) => order.id)));
    const refused = failed.filter((r) => !pending.has(r.id)).map(({ id, number }) => ({ id, number }));
    void run([...unanswered.current, ...chunksOf(refused)]);
  }

  function close(next: boolean) {
    if (next) return onOpenChange(true);
    controller.current?.abort();
    void invalidateOrders(client);
    if (shipped.length) onShipped(shipped.map((r) => r.id));
    setPhase("form");
    setResults(new Map());
    setCourier("");
    setChoice("mark");
    unanswered.current = [];
    onOpenChange(false);
  }

  const title = `Ship ${ordersText(phase === "form" ? ready.length : sent)}`;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-5 p-5 sm:max-w-md">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {phase === "form" && skipped > 0 && (
            <DialogDescription className="text-sm text-ink-2">
              {skipped === 1
                ? "1 selected order isn't ready and is skipped."
                : `${skipped} selected orders aren't ready and are skipped.`}
            </DialogDescription>
          )}
        </div>

        {phase === "form" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              start();
            }}
          >
            {labelsOffered && (
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">How to ship</legend>
                <div className="grid grid-cols-2 gap-2">
                  <ShipChoice name="bulk-ship-choice" value="mark" label="Mark as shipped" choice={choice} onChoose={setChoice} />
                  <ShipChoice name="bulk-ship-choice" value="label" label="Buy labels" choice={choice} onChoose={setChoice} />
                </div>
              </fieldset>
            )}
            {choice === "mark" ? (
              <Field id="bulk-ship-courier" label="Courier" hint="Tracking numbers can be added one order at a time.">
                {(props) => (
                  <Input {...props} value={courier} onChange={(event) => setCourier(event.target.value)} autoComplete="off" maxLength={100} />
                )}
              </Field>
            ) : (
              <p className="text-sm text-ink">Each label takes a few seconds.</p>
            )}
            <Button type="submit" className="mt-1" disabled={ready.length === 0}>
              {title}
            </Button>
          </form>
        )}

        {phase === "running" && (
          <div className="flex flex-col gap-2">
            <p role="status" className="text-sm text-ink">{`Shipping ${progress.done} of ${progress.of}`}</p>
            <progress value={progress.done} max={progress.of} aria-hidden className="h-1.5 w-full accent-ink" />
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-4">
            <p role="status" className="sr-only">
              {failed.length ? `${shipped.length} shipped, ${failed.length} not shipped.` : `${shipped.length} shipped.`}
            </p>
            {shipped.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-ink">{`${shipped.length} shipped`}</p>
                {labels.length > 0 && (
                  <ul className="flex flex-col">
                    {labels.map((label) => (
                      <li key={label.id}>
                        <a
                          href={label.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {`Print label for #${label.number}`}
                          <ExternalLink aria-hidden className="size-4" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {failed.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-late">{`${failed.length} not shipped`}</p>
                <ul aria-label="Not shipped" className="flex flex-col gap-1.5">
                  {failed.map((r) => (
                    <li key={r.id} className="text-sm text-ink">
                      <span className="font-medium tabular-nums">{`#${r.number}`}</span>
                      <span className="text-ink-2">{` ${r.message}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              {failed.length > 0 && (
                <Button type="button" onClick={retry}>
                  Try again
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
