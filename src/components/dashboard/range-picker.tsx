"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { checkCustomRange, parseRange, rangeSearch, rangeWords, type RangeChoice, type RangePreset } from "@/lib/dashboard/range";

const PRESET_LABEL: Record<RangePreset, string> = {
  "7d": "7 days",
  "30d": "30 days",
  quarter: "This quarter",
  year: "This year",
};

const PRESETS = Object.keys(PRESET_LABEL) as RangePreset[];

const SEGMENT =
  "min-h-9 shrink-0 rounded-full px-3.5 text-sm whitespace-nowrap text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet pointer-coarse:min-h-11";
const PICKED = "bg-ink font-medium text-white hover:text-white";

const DATE_INPUT =
  "h-11 rounded-lg border border-line px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-violet aria-invalid:border-late md:h-9 md:text-sm";

/**
 * The dashboard's date range, kept in the address: `?range=7d|quarter|year`, `?from=…&to=…` for a
 * custom range, nothing for the default last 30 days. A custom range erp-api would refuse is
 * stopped under the fields, and the address doesn't change.
 */
export function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const choice = parseRange(useSearchParams());
  const custom = !("preset" in choice);

  const go = (next: RangeChoice) => {
    const query = rangeSearch(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div role="group" aria-label="Date range" className="flex max-w-full overflow-x-auto overscroll-x-contain rounded-full bg-card p-1">
      {PRESETS.map((preset) => {
        const picked = "preset" in choice && choice.preset === preset;
        return (
          <button key={preset} type="button" aria-pressed={picked} onClick={() => go({ preset })} className={cn(SEGMENT, picked && PICKED)}>
            {PRESET_LABEL[preset]}
          </button>
        );
      })}
      <CustomRange picked={custom ? choice : null} onApply={go} />
    </div>
  );
}

/** "Custom…": two dates and Apply, in a popover. Shows the picked range in words once there is one. */
function CustomRange({ picked, onApply }: { picked: { from: string; to: string } | null; onApply: (choice: RangeChoice) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(picked?.from ?? "");
  const [to, setTo] = useState(picked?.to ?? "");
  const [error, setError] = useState<string | null>(null);

  const changeOpen = (next: boolean) => {
    if (next) {
      setFrom(picked?.from ?? "");
      setTo(picked?.to ?? "");
    }
    setError(null);
    setOpen(next);
  };

  const apply = () => {
    const refused = checkCustomRange(from, to);
    setError(refused);
    if (refused) return;
    onApply({ from, to });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-pressed={picked !== null} className={cn(SEGMENT, picked && PICKED)}>
          {picked ? rangeWords(picked) : "Custom…"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} aria-label="Custom range" className="w-72 gap-3 rounded-xl p-4">
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-ink">
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-invalid={error ? true : undefined} className={DATE_INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={DATE_INPUT}
            />
          </label>
          <p id={`${id}-error`} aria-live="polite" className="text-caption text-late-ink empty:hidden">
            {error}
          </p>
          <Button type="submit" className="self-end">
            Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
