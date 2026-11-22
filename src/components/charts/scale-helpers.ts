import { tickStep } from "d3-array";
import { LOCALE } from "@/lib/format/money";

/** erp-api's money: a plain decimal string (ADR 0002). Same rule as `src/lib/format/money.ts`. */
const AMOUNT = /^-?\d+(\.\d+)?$/;

/**
 * An amount as a number, to position marks on a chart and nothing else. Never
 * use it for a label, a sum or a comparison shown to users: those stay strings.
 */
export function amountForScale(amount: string): number {
  if (!AMOUNT.test(amount)) throw new Error(`Not a money amount: ${JSON.stringify(amount)}`);
  return Number(amount);
}

/** 0 plus round steps up to at least `max`; `[0]` when there is nothing to show. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const step = tickStep(0, max, count);
  const ticks: number[] = [];
  // Rounded so a fractional step (0.1 * 3) doesn't leave float noise in a label.
  for (let i = 0; i * step < max + step; i += 1) ticks.push(Number((i * step).toPrecision(12)));
  return ticks;
}

const compactFormatters = new Map<string, Intl.NumberFormat>();

/**
 * A short axis label: `€12.5K`, `€1.2M`, or `1.2K` without a currency. en-GB
 * writes the currency form with a lowercase `k`, so the compact suffix (and
 * only that part, never a symbol or code) is upper-cased to match every axis.
 */
export function compactAxis(value: number, currency?: string): string {
  const key = currency ?? "";
  let formatter = compactFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      ...(currency ? { style: "currency", currency } : {}),
    });
    compactFormatters.set(key, formatter);
  }
  return formatter
    .formatToParts(value)
    .map((part) => (part.type === "compact" ? part.value.toUpperCase() : part.value))
    .join("");
}

/** A rate as a whole percentage: `0.95` is `95%`. */
export function percentAxis(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
