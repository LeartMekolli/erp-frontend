"use client";

import { useId } from "react";
import { useController, useFormContext, useFormState } from "react-hook-form";

import { Field } from "@/components/auth/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { CustomerGroupChoice } from "@/lib/api/schema-types";
import { NAME_LIMIT, type CustomerValues } from "@/lib/customers/form";

/**
 * The Customer section: name, group and the workshop pick, in a `useCustomerForm` (`section-forms.ts`).
 * Shown in the header's Edit, and in part 2's New customer. The group picker is left out when the
 * groups can't be read (`groups` null).
 */
export function CustomerFields({ groups }: { groups: CustomerGroupChoice[] | null }) {
  const id = useId();
  const { control, register } = useFormContext<CustomerValues>();
  const { errors } = useFormState({ control });
  const group = useController({ control, name: "groupId" });
  const pick = useController({ control, name: "mayPickPartner" });

  return (
    <div className="flex flex-col gap-4">
      <Field id={`${id}-name`} label="Name" error={errors.name?.message}>
        {(props) => <Input {...props} {...register("name")} maxLength={NAME_LIMIT} autoComplete="off" aria-required />}
      </Field>
      {groups && (
        <Field id={`${id}-group`} label="Customer group (optional)" hint="The group's markup or discount applies to their quotes." error={errors.groupId?.message}>
          {(props) => (
            <NativeSelect
              {...props}
              name={group.field.name}
              value={group.field.value ?? ""}
              onChange={(event) => group.field.onChange(event.target.value || null)}
              onBlur={group.field.onBlur}
            >
              <option value="">No group</option>
              {groups.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )}
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-pick`}
          checked={pick.field.value}
          onCheckedChange={(checked) => pick.field.onChange(checked === true)}
          onBlur={pick.field.onBlur}
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
          {errors.mayPickPartner?.message && <p className="text-caption text-late">{errors.mayPickPartner.message}</p>}
        </div>
      </div>
    </div>
  );
}
