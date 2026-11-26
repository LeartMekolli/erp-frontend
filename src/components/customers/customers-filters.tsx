"use client";

import { SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "cn";

import { SearchField } from "@/components/orders/toolbar";
import { DIALOG_SHEET } from "@/components/production/dialog-classes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import type { BandChoice, CustomerGroupChoice } from "@/lib/api/schema-types";
import { DEFAULT_CUSTOMERS_VIEW, type CustomersView } from "@/lib/customers/view";

interface FilterProps {
  view: CustomersView;
  onChange: (patch: Partial<CustomersView>) => void;
  /** Null when the person can't read them: that filter isn't offered. */
  groups: CustomerGroupChoice[] | null;
  bands: BandChoice[] | null;
}

const STATUSES: { value: CustomersView["status"]; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "all", label: "All" },
];

function SelectField({
  label,
  value,
  onChange,
  options,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  wide: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "w-40")}>
      <label htmlFor={id} className="text-caption font-medium text-ink-2">
        {label}
      </label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)} className="md:h-9 pointer-coarse:h-11">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Group, Band and Status: the same fields in the wide row and the phone's sheet. */
function Fields({ view, onChange, groups, bands, wide }: FilterProps & { wide: boolean }) {
  return (
    <>
      {groups && (
        <SelectField
          label="Group"
          value={view.group ?? ""}
          onChange={(group) => onChange({ group: group || null })}
          options={[{ value: "", label: "Any group" }, { value: "none", label: "No group" }, ...groups.map((group) => ({ value: group.id, label: group.name }))]}
          wide={wide}
        />
      )}
      {bands && (
        <SelectField
          label="Band"
          value={view.band ?? ""}
          onChange={(band) => onChange({ band: band || null })}
          options={[{ value: "", label: "Any band" }, ...bands.map((band) => ({ value: band.key, label: band.name }))]}
          wide={wide}
        />
      )}
      <SelectField
        label="Status"
        value={view.status}
        onChange={(status) => onChange({ status: status as CustomersView["status"] })}
        options={STATUSES}
        wide={wide}
      />
    </>
  );
}

const Search = ({ view, onChange }: Pick<FilterProps, "view" | "onChange">) => (
  <SearchField q={view.q} onSearch={(q) => onChange({ q })} label="Search customers" placeholder="Search customers by name" />
);

/** From 768 px: the search, then every filter in one row. */
export function WideCustomersFilters(props: FilterProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-60 flex-1 lg:flex-none">
        <Search view={props.view} onChange={props.onChange} />
      </div>
      <Fields {...props} wide />
    </div>
  );
}

/** How many filters differ from the default; the search shows for itself. */
function setCount(view: CustomersView): number {
  return [view.group !== DEFAULT_CUSTOMERS_VIEW.group, view.band !== DEFAULT_CUSTOMERS_VIEW.band, view.status !== DEFAULT_CUSTOMERS_VIEW.status].filter(Boolean).length;
}

/** Below 768 px: the search and a Filters button; the sheet's choices apply at once. */
export function PhoneCustomersFilters(props: FilterProps) {
  const [open, setOpen] = useState(false);
  const count = setCount(props.view);
  return (
    <div className="flex items-center gap-2">
      <Search view={props.view} onChange={props.onChange} />
      {/* A trigger, so Radix gives focus back to Filters when Done or Escape closes the sheet. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" className="h-11 shrink-0 px-3 font-medium">
            <SlidersHorizontal aria-hidden />
            {count > 0 ? `Filters · ${count}` : "Filters"}
          </Button>
        </DialogTrigger>
        <DialogContent className={DIALOG_SHEET} aria-describedby={undefined}>
          <DialogTitle className="text-base font-semibold">Filters</DialogTitle>
          <div className="flex flex-col gap-3">
            <Fields {...props} wide={false} />
          </div>
          <Button className="h-11" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
