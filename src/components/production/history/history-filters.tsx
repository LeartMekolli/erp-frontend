"use client";

import { SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "cn";

import { RangePicker } from "@/components/dashboard/range-picker";
import { SearchField } from "@/components/orders/toolbar";
import { DIALOG_SHEET } from "@/components/production/dialog-classes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import type { Defect, MoveActor } from "@/lib/api/schema-types";
import { actorLabel, setFilterCount, type HistoryFilters, type HistoryResult } from "@/lib/production/move-list";

/** History's own filters: the product type is the page's, shared with the Board and By step. */
export type MoveFilters = Omit<HistoryFilters, "workflowId">;

/** What the filters offer, each list as erp-api gives it. */
export interface FilterOptions {
  productTypes: { id: string; name: string }[];
  steps: { key: string; name: string }[];
  defects: Defect[];
  people: MoveActor[];
}

interface FilterProps {
  workflowId: string | null;
  onWorkflow: (workflowId: string) => void;
  filters: MoveFilters;
  onChange: (patch: Partial<MoveFilters>) => void;
  options: FilterOptions;
}

const RESULTS: { value: HistoryResult; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pass", label: "Passed" },
  { value: "fail", label: "Failed" },
  { value: "correction", label: "Corrected" },
];

const SEARCH_LABEL = "Search order, product or customer";
const SEARCH_PLACEHOLDER = "Order, product or customer";

function SelectField({
  label,
  value,
  onChange,
  none,
  options,
  className,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** The empty choice, such as "Any step"; without it a value is always picked. */
  none?: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-caption font-medium text-ink-2">
        {label}
      </label>
      <NativeSelect id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} className="md:h-9 pointer-coarse:h-11">
        {none !== undefined && <option value="">{none}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Product type, Step, Defect and Person: the same fields in the wide row and the phone's sheet. */
function Fields({ workflowId, onWorkflow, filters, onChange, options, wide }: FilterProps & { wide: boolean }) {
  return (
    <>
      <SelectField
        label="Product type"
        value={workflowId}
        onChange={(id) => id && onWorkflow(id)}
        none={workflowId === null ? "Pick a product type" : undefined}
        options={options.productTypes.map((type) => ({ value: type.id, label: type.name }))}
        className={wide ? "w-52" : undefined}
      />
      <SelectField
        label="Step"
        value={filters.stepKey}
        onChange={(stepKey) => onChange({ stepKey })}
        none="Any step"
        options={options.steps.map((step) => ({ value: step.key, label: step.name }))}
        className={wide ? "w-40" : undefined}
      />
      <SelectField
        label="Defect"
        value={filters.defectKey}
        onChange={(defectKey) => onChange({ defectKey })}
        none="Any defect"
        options={options.defects.map((defect) => ({ value: defect.key, label: defect.name }))}
        className={wide ? "w-40" : undefined}
      />
      <SelectField
        label="Person"
        value={filters.actorId}
        onChange={(actorId) => onChange({ actorId })}
        none="Anyone"
        options={options.people.map((person) => ({ value: person.id, label: actorLabel(person) }))}
        className={wide ? "w-52" : undefined}
      />
    </>
  );
}

/** All, Passed, Failed or Corrected: native radios, so the arrow keys move between them. */
function ResultSwitch({ value, onChange }: { value: HistoryResult; onChange: (result: HistoryResult) => void }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label="Result" className="inline-flex max-w-full self-start rounded-[10px] bg-ground p-[3px]">
      {RESULTS.map((result) => (
        <label
          key={result.value}
          className="flex min-h-9 cursor-pointer items-center rounded-lg px-3 text-sm whitespace-nowrap text-ink-2 has-checked:bg-card has-checked:font-medium has-checked:text-ink has-checked:shadow-[0_1px_2px_rgb(22_20_28/0.08)] has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-violet pointer-coarse:min-h-11"
        >
          <input type="radio" name={name} value={result.value} checked={value === result.value} onChange={() => onChange(result.value)} className="sr-only" />
          {result.label}
        </label>
      ))}
    </div>
  );
}

/** From 768 px: every filter in one wrapping row, then the date range and the result switch. */
export function WideFilters(props: FilterProps) {
  const { filters, onChange } = props;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Fields {...props} wide />
        <div className="flex min-w-60 flex-1 lg:justify-end">
          <SearchField q={filters.q} onSearch={(q) => onChange({ q })} label={SEARCH_LABEL} placeholder={SEARCH_PLACEHOLDER} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResultSwitch value={filters.result} onChange={(result) => onChange({ result })} />
        <RangePicker choice={filters.range} onChange={(range) => onChange({ range })} />
      </div>
    </div>
  );
}

/**
 * Below 768 px: the date range and a Filters button, then the result switch. The sheet edits a copy of the
 * filters and hands it over however it closes, so a search typed just before closing is never lost.
 */
export function PhoneFilters(props: FilterProps) {
  const { filters, onChange, workflowId, onWorkflow, options } = props;
  const [draft, setDraft] = useState<MoveFilters | null>(null);
  const count = setFilterCount({ workflowId: workflowId ?? "", ...filters });

  const close = () => {
    if (draft) onChange({ ...draft, q: draft.q?.trim() || null });
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <RangePicker choice={filters.range} onChange={(range) => onChange({ range })} />
        </div>
        <Button variant="secondary" className="h-11 shrink-0 px-3 font-medium" onClick={() => setDraft(filters)}>
          <SlidersHorizontal aria-hidden />
          {count > 0 ? `Filters · ${count}` : "Filters"}
        </Button>
      </div>
      <ResultSwitch value={filters.result} onChange={(result) => onChange({ result })} />

      <Dialog open={draft !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className={DIALOG_SHEET} aria-describedby={undefined}>
          <DialogTitle className="text-base font-semibold">Filters</DialogTitle>
          {draft && (
            <div className="flex flex-col gap-3">
              <Fields
                workflowId={workflowId}
                onWorkflow={(id) => {
                  // The page's product type changes at once; its steps and people come with it.
                  setDraft({ ...draft, stepKey: null, actorId: null });
                  onWorkflow(id);
                }}
                filters={draft}
                onChange={(patch) => setDraft({ ...draft, ...patch })}
                options={options}
                wide={false}
              />
              <input
                type="search"
                aria-label={SEARCH_LABEL}
                placeholder={SEARCH_PLACEHOLDER}
                value={draft.q ?? ""}
                onChange={(event) => setDraft({ ...draft, q: event.target.value.trim() ? event.target.value : null })}
                className="h-11 rounded-lg border border-line px-3 text-base text-ink placeholder:text-ink-2 focus-visible:outline-2 focus-visible:outline-violet"
              />
            </div>
          )}
          <Button className="h-11" onClick={close}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
