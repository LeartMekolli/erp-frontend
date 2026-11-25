"use client";

import { useId, type Ref } from "react";

import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StepCount } from "@/lib/api/schema-types";

/**
 * The product type's steps in path order, each with its active pieces. From 768 px tabs across the list panel,
 * as the Orders tabs; on a phone a picker. `listRef` is the tab row, where focus goes back when the selection clears.
 */
export function StepTabs({
  steps,
  value,
  onChange,
  listRef,
}: {
  steps: StepCount[];
  value: string | null;
  onChange: (stepKey: string) => void;
  listRef?: Ref<HTMLDivElement>;
}) {
  const id = useId();
  return (
    <>
      <Tabs value={value ?? ""} onValueChange={onChange} activationMode="manual" className="hidden min-w-0 md:flex">
        <TabsList
          ref={listRef}
          variant="line"
          aria-label="Steps"
          className="-mb-px h-auto! w-full justify-start overflow-x-auto [scrollbar-width:none]"
        >
          {steps.map((step) => (
            <TabsTrigger
              key={step.key}
              value={step.key}
              // Every step filters the one list below rather than showing a panel of its own.
              aria-controls="production-lines"
              className="h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink"
            >
              {step.name}{" "}
              <span className="rounded-full bg-line px-1.5 text-xs font-medium text-ink-2 tabular-nums in-data-active:bg-lilac in-data-active:text-violet-ink">
                {step.active}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-1 md:hidden">
        <label htmlFor={`${id}-step`} className="text-caption font-medium text-ink-2">
          Step
        </label>
        <NativeSelect id={`${id}-step`} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
          {value === null && <option value="">Pick a step</option>}
          {steps.map((step) => (
            <option key={step.key} value={step.key}>
              {`${step.name} · ${step.active}`}
            </option>
          ))}
        </NativeSelect>
      </div>
    </>
  );
}
