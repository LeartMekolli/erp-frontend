"use client";

import { ArrowUpDown } from "lucide-react";
import { useId } from "react";

import { SearchField } from "@/components/orders/toolbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import type { PieceSort } from "@/lib/api/schema-types";

const SORTS: readonly PieceSort[] = ["due_on", "-due_on", "priority", "started"];

const SORT_LABEL: Record<PieceSort, string> = {
  due_on: "Due soonest",
  "-due_on": "Due latest",
  priority: "Priority",
  started: "Oldest started",
};

/** A product type to pick, with its active pieces when they're known. */
export interface ProductType {
  id: string;
  name: string;
  active: number | null;
}

/** Product type, search, sort and "Only what I can work" above By step's lines. */
export function ByStepToolbar({
  productTypes,
  workflowId,
  onWorkflow,
  q,
  onSearch,
  sort,
  onSort,
  workable,
  onWorkable,
  canMove,
}: {
  productTypes: ProductType[];
  workflowId: string | null;
  onWorkflow: (workflowId: string) => void;
  q: string | null;
  onSearch: (q: string | null) => void;
  sort: PieceSort;
  onSort: (sort: PieceSort) => void;
  workable: boolean;
  onWorkable: (workable: boolean) => void;
  /** "Only what I can work" means nothing to someone who can't move pieces. */
  canMove: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end lg:flex-nowrap">
      <div className="flex flex-col gap-1 md:w-60">
        <label htmlFor={`${id}-type`} className="text-caption font-medium text-ink-2">
          Product type
        </label>
        <NativeSelect id={`${id}-type`} value={workflowId ?? ""} onChange={(event) => onWorkflow(event.target.value)} className="md:h-9 pointer-coarse:h-11">
          {workflowId === null && <option value="">Pick a product type</option>}
          {productTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.active === null ? type.name : `${type.name} · ${type.active}`}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
        <SearchField q={q} onSearch={onSearch} label="Search order, product or customer" placeholder="Order, product or customer" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" aria-label={`Sort: ${SORT_LABEL[sort]}`} className="h-11 px-3 font-medium md:h-9 pointer-coarse:h-11">
              <ArrowUpDown aria-hidden />
              <span className="hidden sm:inline">{SORT_LABEL[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
            <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onSort(value as PieceSort)}>
              {SORTS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value} className="min-h-11 md:min-h-9">
                  {SORT_LABEL[value]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {canMove && (
          <div className="flex min-h-11 items-center gap-2.5 px-1 md:min-h-9 pointer-coarse:min-h-11">
            <Checkbox id={`${id}-workable`} checked={workable} onCheckedChange={(checked) => onWorkable(checked === true)} />
            <label htmlFor={`${id}-workable`} className="text-sm whitespace-nowrap text-ink">
              Only what I can work
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
