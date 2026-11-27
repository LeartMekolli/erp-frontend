import { useForm, type FieldError, type FieldErrors, type FieldValues, type ResolverResult } from "react-hook-form";

import { COPY } from "@/components/new-order/copy";
import {
  addressesProblems,
  customerProblems,
  personProblems,
  termsProblems,
  type AddressesValues,
  type CustomerValues,
  type NewCustomerValues,
  type TermsValues,
} from "@/lib/customers/form";
import { ADDRESS_LIMITS, type AddressField, type AddressProblem } from "@/lib/new-order/form";

/**
 * One React Hook Form per section of the customer form, checked by `@/lib/customers/form`'s rules. A
 * field's problem shows once it's left, and every one after a Save that was stopped; from then on each
 * is checked again as it's typed, which also takes erp-api's reason off a field once it changes.
 * The sections read their form with `useFormContext`, so they go inside a `FormProvider`.
 */
const SECTION = { mode: "onTouched" } as const;

const problem = (message: string): FieldError => ({ type: "problem", message });

function settle<T extends FieldValues>(values: T, errors: FieldErrors<T>): ResolverResult<T> {
  return Object.keys(errors).length === 0 ? { values, errors: {} } : { values: {}, errors };
}

export function customerResolver(values: CustomerValues): ResolverResult<CustomerValues> {
  const errors: FieldErrors<CustomerValues> = {};
  const { name } = customerProblems(values);
  if (name) errors.name = problem(name);
  return settle(values, errors);
}

function problemText(problem: AddressProblem, field: AddressField): string {
  if (problem === "missing") return COPY.delivery.problems.missing;
  if (problem === "country") return COPY.delivery.problems.country;
  return COPY.delivery.problems.tooLong(ADDRESS_LIMITS[field]);
}

function addressErrors(problems: Partial<Record<AddressField, AddressProblem>>): Partial<Record<AddressField, FieldError>> | undefined {
  const entries = Object.entries(problems) as [AddressField, AddressProblem][];
  if (entries.length === 0) return undefined;
  const errors: Partial<Record<AddressField, FieldError>> = {};
  for (const [field, kind] of entries) errors[field] = problem(problemText(kind, field));
  return errors;
}

export function addressesResolver(values: AddressesValues): ResolverResult<AddressesValues> {
  const problems = addressesProblems(values);
  const errors: FieldErrors<AddressesValues> = {};
  const shipping = addressErrors(problems.shipping);
  if (shipping) errors.shipping = shipping;
  const billing = addressErrors(problems.billing);
  if (billing) errors.billing = billing;
  if (problems.vat) errors.vat = problem(problems.vat);
  return settle(values, errors);
}

/** The Customer, Addresses and First person sections' problems together, for New customer's one form. */
export function newCustomerResolver(values: NewCustomerValues): ResolverResult<NewCustomerValues> {
  const errors: FieldErrors<NewCustomerValues> = {
    ...customerResolver(values).errors,
    ...addressesResolver(values).errors,
  };
  const { email } = personProblems(values);
  if (email) errors.email = problem(email);
  return settle(values, errors);
}

export function termsResolver(values: TermsValues): ResolverResult<TermsValues> {
  const errors: FieldErrors<TermsValues> = {};
  const problems = termsProblems(values);
  if (problems.daysToPay) errors.daysToPay = problem(problems.daysToPay);
  if (problems.creditLimit) errors.creditLimit = problem(problems.creditLimit);
  return settle(values, errors);
}

export const useCustomerForm = (start: CustomerValues) => useForm<CustomerValues>({ ...SECTION, defaultValues: start, resolver: customerResolver });

export const useAddressesForm = (start: AddressesValues) => useForm<AddressesValues>({ ...SECTION, defaultValues: start, resolver: addressesResolver });

export const useNewCustomerForm = (start: NewCustomerValues) =>
  useForm<NewCustomerValues>({ ...SECTION, defaultValues: start, resolver: newCustomerResolver });

export const useTermsForm = (start: TermsValues) => useForm<TermsValues>({ ...SECTION, defaultValues: start, resolver: termsResolver });
