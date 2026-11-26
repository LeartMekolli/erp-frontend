import type { CustomerListQuery } from "@/lib/api/schema-types";

/** What the Customers list shows: kept in React state, never in the address. */
export interface CustomersView {
  /** Any part of the name. */
  q: string | null;
  /** A group's id, "none" for customers in no group, or null for any group. */
  group: string | null;
  /** A band's key, or null for any band. */
  band: string | null;
  status: "active" | "disabled" | "all";
}

export const DEFAULT_CUSTOMERS_VIEW: CustomersView = { q: null, group: null, band: null, status: "active" };

/** `GET /customers`'s filters for a view; paging is added by the list. Blank values send nothing. */
export function customersQuery(view: CustomersView): CustomerListQuery {
  const query: CustomerListQuery = {};
  const q = view.q?.trim();
  if (q) query.q = q;
  if (view.status !== "all") query.status = view.status;
  if (view.group) query.customer_group = view.group;
  if (view.band) query.band = view.band;
  return query;
}

/** Whether anything differs from the default view, so the list offers Clear filters. */
export function filtersSet(view: CustomersView): boolean {
  return (
    Boolean(view.q?.trim()) ||
    view.group !== DEFAULT_CUSTOMERS_VIEW.group ||
    view.band !== DEFAULT_CUSTOMERS_VIEW.band ||
    view.status !== DEFAULT_CUSTOMERS_VIEW.status
  );
}
