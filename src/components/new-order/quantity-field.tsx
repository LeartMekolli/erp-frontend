"use client";

import { Minus, Plus } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_QUANTITY, type NewOrderValues } from "@/lib/new-order/form";

import { COPY } from "./copy";
import { FieldRow } from "./field-row";

/**
 * The quantity: typed, or stepped by one with − and + or the ↑ and ↓ keys, never below 1 or above
 * 1,000,000. Anything typed that isn't a whole number steps from 1. `problems` are shown under it.
 */
export function QuantityField({ problems }: { problems: readonly string[] }) {
  const { register, getValues, setValue } = useFormContext<NewOrderValues>();

  function step(by: number) {
    const now = Number.parseInt(getValues("quantity"), 10);
    const next = Number.isNaN(now) ? 1 : Math.min(MAX_QUANTITY, Math.max(1, now + by));
    setValue("quantity", String(next), { shouldDirty: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    step(event.key === "ArrowUp" ? 1 : -1);
  }

  return (
    <FieldRow label={COPY.product.quantity} problems={problems}>
      {(props) => (
        <div className="flex min-w-0">
          {/* Out of the tab order: the arrow keys do the same from the field, so it stays one stop. */}
          <Button type="button" variant="outline" size="icon" tabIndex={-1} aria-label={COPY.product.less} className="rounded-r-none" onClick={() => step(-1)}>
            <Minus aria-hidden />
          </Button>
          <Input
            {...props}
            {...register("quantity")}
            inputMode="numeric"
            autoComplete="off"
            onKeyDown={onKeyDown}
            className="rounded-none border-x-0 px-1 text-center tabular-nums"
          />
          <Button type="button" variant="outline" size="icon" tabIndex={-1} aria-label={COPY.product.more} className="rounded-l-none" onClick={() => step(1)}>
            <Plus aria-hidden />
          </Button>
        </div>
      )}
    </FieldRow>
  );
}
