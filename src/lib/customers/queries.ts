"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import type {
  AddressesUpdate,
  BandChoice,
  Customer,
  CustomerAddresses,
  CustomerGroupChoice,
  CustomerListQuery,
  CustomerMoney,
  CustomerUpdate,
  Order,
  PaymentTermsBody,
} from "@/lib/api/schema-types";
import { newOrderKeys } from "@/lib/new-order/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";

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
