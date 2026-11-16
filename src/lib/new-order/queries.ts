"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import type { Address, CatalogProduct } from "@/lib/api/schema-types";

export const newOrderKeys = {
  all: ["new-order"] as const,
  customer: (id: string | null) => ["new-order", "customer", id] as const,
  addresses: (id: string | null) => ["new-order", "addresses", id] as const,
  products: (customerId: string | null) => ["new-order", "products", customerId] as const,
  optionGroups: ["new-order", "option-groups"] as const,
  speeds: (customerId: string | null) => ["new-order", "speeds", customerId] as const,
  rates: (customerId: string | null, address: Address | null) => ["new-order", "rates", customerId, address] as const,
};

/** One customer with its group, payment terms and plan. */
export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: newOrderKeys.customer(id),
    enabled: id !== null,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/customers/{id}", { params: { path: { id: id ?? "" } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** The customer's saved shipping and billing addresses. */
export function useCustomerAddresses(id: string | null) {
  return useQuery({
    queryKey: newOrderKeys.addresses(id),
    enabled: id !== null,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/customers/{id}/addresses", { params: { path: { id: id ?? "" } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** Every product the customer can see, all pages at 200 a page, sorted by name. */
export function useCustomerProducts(customerId: string | null) {
  return useQuery({
    queryKey: newOrderKeys.products(customerId),
    enabled: customerId !== null,
    queryFn: async (): Promise<CatalogProduct[]> => {
      const products: CatalogProduct[] = [];
      let cursor: string | undefined;
      do {
        const { data, error, response } = await api.GET("/catalog/products", {
          params: { query: { customer_id: customerId ?? "", limit: 200, ...(cursor ? { cursor } : {}) } },
        });
        if (!data) throw problemFrom(error, response);
        products.push(...data.data);
        cursor = data.next_cursor ?? undefined;
      } while (cursor);
      return products.sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** Option groups with their values' keys and names. */
export function useOptionGroups() {
  return useQuery({
    queryKey: newOrderKeys.optionGroups,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/catalog/option-groups");
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}

/** The delivery speeds the customer's plan offers. */
export function useDeliverySpeeds(customerId: string | null) {
  return useQuery({
    queryKey: newOrderKeys.speeds(customerId),
    enabled: customerId !== null,
    queryFn: async () => {
      const { data, error, response } = await api.GET("/pricing/quotes/delivery-speeds", {
        params: { query: { customer_id: customerId ?? "" } },
      });
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}

/**
 * Each shipping method's price for the customer, to `address` or the saved one when null. A POST, but
 * it only reads, so it is a query with no idempotency key.
 */
export function useShippingRates(customerId: string | null, address: Address | null, enabled: boolean) {
  return useQuery({
    queryKey: newOrderKeys.rates(customerId, address),
    enabled: enabled && customerId !== null,
    queryFn: async () => {
      const { data, error, response } = await api.POST("/orders/shipping-rates", {
        body: { customer_id: customerId ?? "", ...(address ? { address } : {}) },
      });
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}
