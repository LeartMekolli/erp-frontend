"use client";

import { useId } from "react";
import { useFormContext, useFormState } from "react-hook-form";

import { Field } from "@/components/auth/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CUSTOMER_ROLES, EMAIL_LIMIT, type CustomerRole, type PersonValues } from "@/lib/customers/form";

const ROLE_NAMES: Record<CustomerRole, string> = { owner: "Owner", admin: "Admin", buyer: "Buyer", viewer: "Viewer" };

/**
 * The First person section: the email of someone who orders for this customer, and their role, in a
 * `useNewCustomerForm` (`section-forms.ts`). A blank email means no invitation.
 */
export function PersonFields() {
  const id = useId();
  const { control, register } = useFormContext<PersonValues>();
  const { errors } = useFormState({ control });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field id={`${id}-email`} label="Email" error={errors.email?.message}>
          {(props) => <Input {...props} {...register("email")} type="email" autoComplete="off" maxLength={EMAIL_LIMIT} />}
        </Field>
        <Field id={`${id}-role`} label="Role" error={errors.role?.message}>
          {(props) => (
            <NativeSelect {...props} {...register("role")}>
              {CUSTOMER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_NAMES[role]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <p className="text-caption text-ink-2">They&apos;ll get an email to set up their access, once the customer is created.</p>
    </div>
  );
}
