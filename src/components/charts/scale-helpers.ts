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

/** The measured drawing area every chart receives from its frame. */
export type ChartSize = { width: number; height: number };

/** A point in the drawing's own pixels. */
export type ChartDot = { x: number; y: number };

/** A local-time date, so ticks fall on the user's midnights. */
export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Up to five evenly spaced indexes for the bottom labels. */
export function labelIndexes(count: number): number[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i);
  return [0, 1, 2, 3, 4].map((i) => Math.round((i * (count - 1)) / 4));
}

/**
 * Runs of consecutive items that have a dot: an item with no dot (`null`)
 * breaks the line, it is never drawn as zero.
 */
export function runsOf<T>(items: T[], dotOf: (item: T) => ChartDot | null): ChartDot[][] {
  const runs: ChartDot[][] = [];
  let run: ChartDot[] = [];
  for (const item of items) {
    const dot = dotOf(item);
    if (dot === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push(dot);
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** A rate as a whole percentage: `0.95` is `95%`. */
export function percentAxis(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
