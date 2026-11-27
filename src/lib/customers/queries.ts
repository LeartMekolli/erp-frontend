"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type {
  AddressesUpdate,
  BandChoice,
  CreatedCustomer,
  Customer,
  CustomerAddresses,
  CustomerCreate,
  CustomerGroupChoice,
  CustomerListQuery,
  CustomerMoney,
  CustomerUpdate,
  Order,
  PaymentTermsBody,
  SentInvitation,
} from "@/lib/api/schema-types";
import { newOrderKeys } from "@/lib/new-order/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";
import { useDebouncedValue } from "@/lib/use-debounced-value";

import type { CustomerRole } from "./form";
import { customersQuery, type CustomersView } from "./view";

const LIST_PAGE = 50;
const ORDERS_PAGE = 10;

export const customersKeys = {
  all: ["customers"] as const,
  list: (query: CustomerListQuery) => ["customers", "list", query] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
  addresses: (id: string) => ["customers", "addresses", id] as const,
  money: (id: string) => ["customers", "money", id] as const,
  orders: (id: string) => ["customers", "orders", id] as const,
  nameTaken: (name: string) => ["customers", "name-taken", name] as const,
  groups: ["customers", "groups"] as const,
  bands: ["customers", "bands"] as const,
};

/** A customer change shows everywhere it's read: on Customers, and in an open New order. */
function refresh(client: QueryClient) {
  return Promise.all([client.invalidateQueries({ queryKey: customersKeys.all }), client.invalidateQueries({ queryKey: newOrderKeys.all })]);
}

/**
 * Customers, newest first, 50 at a time, as the view filters them. Another view starts again from its
 * first page; the rows already shown stay, with `isPlaceholderData`, until it comes.
 */
export function useCustomersList(view: CustomersView) {
  const query = customersQuery(view);
  return useCursorList<Customer>({
    queryKey: customersKeys.list(query),
    fetchPage: async (cursor) => {
      const { data, error, response } = await api.GET("/customers", { params: { query: { ...query, limit: LIST_PAGE, ...(cursor ? { cursor } : {}) } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    keepPrevious: true,
  });
}

/** One customer with its group, band, plan and payment terms. */
export function useCustomerDetail(id: string) {
  return useQuery({
    queryKey: customersKeys.detail(id),
    queryFn: async (): Promise<Customer> => {
      const { data, error, response } = await api.GET("/customers/{id}", { params: { path: { id } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** The customer's shipping and billing addresses and VAT number. */
export function useCustomerAddressBook(id: string) {
  return useQuery({
    queryKey: customersKeys.addresses(id),
    queryFn: async (): Promise<CustomerAddresses> => {
      const { data, error, response } = await api.GET("/customers/{id}/addresses", { params: { path: { id } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** What the customer owes and its open and overdue invoices. Staff with `payment.read` only. */
export function useCustomerMoney(id: string, enabled: boolean) {
  return useQuery({
    queryKey: customersKeys.money(id),
    queryFn: async (): Promise<CustomerMoney> => {
      const { data, error, response } = await api.GET("/payments/customers/{id}", { params: { path: { id } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** The customer's orders, newest placed first, 10 at a time. Staff with `order.read` only. */
export function useCustomerOrders(id: string, enabled: boolean) {
  return useCursorList<Order>({
    queryKey: customersKeys.orders(id),
    fetchPage: async (cursor) => {
      const query = { customer_id: id, sort: "-placed_at" as const, limit: ORDERS_PAGE, ...(cursor ? { cursor } : {}) };
      const { data, error, response } = await api.GET("/orders", { params: { query } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** The groups to file a customer under, by name. */
export function useCustomerGroups() {
  return useQuery({
    queryKey: customersKeys.groups,
    queryFn: async (): Promise<CustomerGroupChoice[]> => {
      const { data, error, response } = await api.GET("/customers/groups");
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}

/** The priority bands, the default first. */
export function useBands() {
  return useQuery({
    queryKey: customersKeys.bands,
    queryFn: async (): Promise<BandChoice[]> => {
      const { data, error, response } = await api.GET("/customers/bands");
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}

/**
 * Makes a customer with its addresses and first person in one `POST /customers`. A retry of the same input
 * reuses the `Idempotency-Key`, so erp-api makes one customer. Customers and the search read it afterwards.
 */
export function useCreateCustomer() {
  const client = useQueryClient();
  return useApiMutation<CustomerCreate, CreatedCustomer>(
    async (body, key) => {
      const { data, error, response } = await api.POST("/customers", { body, params: { header: idempotencyHeader(key) } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSuccess: () => Promise.all([refresh(client), client.invalidateQueries({ queryKey: ["search"] })]) },
  );
}

/**
 * Invites someone to act for the customer, or invites the same email again, which replaces the earlier
 * invitation and tries its email again. A retry of the same input reuses the `Idempotency-Key`.
 * The answer's `email_status` says what became of the email.
 */
export function useSendInvitation(customerId: string) {
  return useApiMutation<{ email: string; role: CustomerRole }, SentInvitation>(async (body, key) => {
    const { data, error, response } = await api.POST("/customers/{id}/invitations", {
      params: { path: { id: customerId }, header: idempotencyHeader(key) },
      body,
    });
    if (!data) throw problemFrom(error, response);
    return data;
  });
}

/**
 * The newest customer already named `name`, active or disabled, once the name has settled for 400 ms and has
 * at least 2 characters; otherwise null. erp-api's `name` filter matches the whole name, in any case but
 * not ignoring accents, so its first answer is the match. Its key holds the settled name, so an older answer
 * never shows for newer text. It's a one-off hint, so a failed check isn't asked again and a settled one
 * isn't refetched every minute.
 */
export function useNameTaken(name: string): Customer | null {
  const settled = useDebouncedValue(name.trim(), 400);
  const checkable = settled.length >= 2;
  const { data } = useQuery({
    queryKey: customersKeys.nameTaken(settled),
    queryFn: async () => {
      const { data, error, response } = await api.GET("/customers", { params: { query: { name: settled, limit: 1 } } });
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
    enabled: checkable,
    retry: false,
    refetchInterval: false,
  });
  if (!checkable || settled !== name.trim()) return null;
  return data?.[0] ?? null;
}

/** Changes the name, status, group or workshop pick; only what's sent changes. A PATCH, so no `Idempotency-Key`. */
export function useUpdateCustomer(id: string) {
  const client = useQueryClient();
  return useApiMutation<CustomerUpdate, Customer>(
    async (body) => {
      const { data, error, response } = await api.PATCH("/customers/{id}", { params: { path: { id } }, body });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => refresh(client) },
  );
}

/** Changes the addresses or VAT number; only what's sent changes, and null clears one. */
export function useSetAddresses(id: string) {
  const client = useQueryClient();
  return useApiMutation<AddressesUpdate, CustomerAddresses>(
    async (body) => {
      const { data, error, response } = await api.PUT("/customers/{id}/addresses", { params: { path: { id } }, body });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => refresh(client) },
  );
}

/** Replaces the payment terms as a whole. Staff with `payment.write` only. */
export function useSetTerms(id: string) {
  const client = useQueryClient();
  return useApiMutation<PaymentTermsBody, Customer["payment_terms"]>(
    async (body) => {
      const { data, error, response } = await api.PUT("/customers/{id}/payment-terms", { params: { path: { id } }, body });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => refresh(client) },
  );
}
