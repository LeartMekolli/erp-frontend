import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { noAnswer, UNKNOWN } from "@/components/auth/copy";
import { isApiProblem } from "@/lib/api/problem";
import type { AddressesValues } from "@/lib/customers/form";
import { ADDRESS_FIELDS, type AddressField } from "@/lib/new-order/form";
import { OfflineError } from "@/lib/session/client-session";

/** What a refused Save shows: erp-api's errors on the form's fields, and anything else above them. */
export interface SaveErrors {
  fields: Record<string, string>;
  message: string | null;
}

/**
 * Sorts a failed save's error onto the form: each erp-api error whose `path` the form knows goes to its
 * field (`toField` maps "shipping_address.city" to the form's name for it, or null), the rest above.
 * A save that got no answer reads as offline or unreachable: the token refresh says so with an
 * `OfflineError`, and a failed `fetch` rejects with a `TypeError`.
 */
export function saveErrors(error: unknown, toField: (path: string) => string | null): SaveErrors {
  if (error instanceof OfflineError || error instanceof TypeError) return { fields: {}, message: noAnswer() };
  if (!isApiProblem(error)) return { fields: {}, message: UNKNOWN };
  const fields: Record<string, string> = {};
  const rest: string[] = [];
  for (const entry of error.errors ?? []) {
    const field = toField(entry.path);
    if (field && !(field in fields)) fields[field] = entry.message;
    else if (!field) rest.push(entry.message);
  }
  if (error.errors?.length) return { fields, message: rest.length ? rest.join(" ") : null };
  return { fields, message: error.detail ?? UNKNOWN };
}

const isAddressField = (field: string | undefined): field is AddressField => (ADDRESS_FIELDS as readonly string[]).includes(field ?? "");

/**
 * erp-api's `shipping_address.city` as the form's shipping city, `vat_number` as its VAT. A billing
 * field while "Bill to the shipping address" is ticked isn't on screen, so it's null and said above.
 * Shared by Edit details and New customer, whose forms hold the addresses under the same names.
 */
export function addressesPath(path: string, values: Pick<AddressesValues, "billToShipping">): Path<AddressesValues> | null {
  if (path === "vat_number") return "vat";
  const [address, field] = path.split(".");
  if (!isAddressField(field)) return null;
  if (address === "shipping_address") return `shipping.${field}`;
  if (address === "billing_address" && !values.billToShipping) return `billing.${field}`;
  return null;
}

/**
 * `saveErrors` for a React Hook Form: each field's error goes on with `setError`, and what goes above the
 * form is returned. `toField` answers null for a field that isn't on screen, so its error is never lost.
 */
export function applySaveErrors<T extends FieldValues>(error: unknown, toField: (path: string) => Path<T> | null, setError: UseFormSetError<T>): string | null {
  const refused = saveErrors(error, toField);
  for (const [field, message] of Object.entries(refused.fields)) setError(field as Path<T>, { type: "server", message });
  return refused.message;
}
