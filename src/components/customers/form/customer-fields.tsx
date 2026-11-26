"use client";

import { useId, useState } from "react";

import { Field } from "@/components/auth/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { CustomerGroupChoice } from "@/lib/api/schema-types";
import { customerProblems, NAME_LIMIT, type CustomerValues } from "@/lib/customers/form";

export type CustomerErrors = Partial<Record<"name" | "groupId" | "mayPickPartner", string>>;

/**
 * The Customer section: name, group and the workshop pick. Shown in the header's Edit, and in part 2's
 * New customer. The group picker is left out when the groups can't be read (`groups` null).
 */
export function CustomerFields({
  value,
  onChange,
  errors = {},
  groups,
  showProblems = false,
}: {
  value: CustomerValues;
  onChange: (next: CustomerValues) => void;
  /** erp-api's reasons, by field; shown at once. */
  errors?: CustomerErrors;
  groups: CustomerGroupChoice[] | null;
  /** Show what's wrong without waiting for the field to be left: after a Save that was stopped. */
  showProblems?: boolean;
}) {
  const id = useId();
  const [leftName, setLeftName] = useState(false);
  const problem = customerProblems(value).name;
  const nameError = errors.name ?? (problem && (leftName || showProblems) ? problem : undefined);

  return (
    <div className="flex flex-col gap-4">
      <Field id={`${id}-name`} label="Name" error={nameError}>
        {(props) => (
          <Input
            {...props}
            value={value.name}
            maxLength={NAME_LIMIT}
            autoComplete="off"
            aria-required
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            onBlur={() => setLeftName(true)}
          />
        )}
      </Field>
      {groups && (
        <Field id={`${id}-group`} label="Customer group (optional)" hint="The group's markup or discount applies to their quotes." error={errors.groupId}>
          {(props) => (
            <NativeSelect {...props} value={value.groupId ?? ""} onChange={(event) => onChange({ ...value, groupId: event.target.value || null })}>
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )}
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-pick`}
          checked={value.mayPickPartner}
          onCheckedChange={(checked) => onChange({ ...value, mayPickPartner: checked === true })}
          aria-describedby={`${id}-pick-hint`}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={`${id}-pick`} className="text-sm font-medium text-ink">
            May pick the workshop
          </label>
          <p id={`${id}-pick-hint`} className="text-caption text-ink-2">
            Their people choose which workshop makes their order.
          </p>
          {errors.mayPickPartner && <p className="text-caption text-late">{errors.mayPickPartner}</p>}
        </div>
      </div>
    </div>
  );
}
