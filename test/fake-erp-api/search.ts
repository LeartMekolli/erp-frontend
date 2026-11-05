/**
 * The fake erp-api's ⌘K search (erp-api `src/modules/ai/search.service.ts`):
 * orders by the start of their number, customers and partners by any part of
 * their name, published help articles by title, at most 5 of each, and an
 * empty list for each kind the person may not read.
 */

import type { Order, SearchResponse } from "../../src/lib/api/schema-types";

import { CUSTOMERS } from "./orders-seed";
import { PARTNER_NAMES, type FakeUser } from "./seed";

const LIMIT = 5;

export const ARTICLES = [
  { id: "66666666-0000-4000-8000-000000000001", title: "How refunds work" },
  { id: "66666666-0000-4000-8000-000000000002", title: "Shipping with a courier account" },
  { id: "66666666-0000-4000-8000-000000000003", title: "Recording a bank transfer" },
];

const contains = (name: string, q: string) => name.toLowerCase().includes(q.toLowerCase());
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function search(user: FakeUser, q: string, orders: Order[]): SearchResponse {
  const may = (permission: FakeUser["permissions"][number]) => user.permissions.includes(permission);
  return {
    orders:
      may("order.read") && /^\d{1,9}$/.test(q)
        ? orders
            .filter((order) => String(order.number).startsWith(q))
            .sort((a, b) => a.number - b.number)
            .slice(0, LIMIT)
            .map(({ id, number, customer }) => ({ id, number, customer: { ...customer } }))
        : [],
    customers: may("customer.read")
      ? Object.values(CUSTOMERS).filter((c) => contains(c.name, q)).map((c) => ({ ...c })).sort(byName).slice(0, LIMIT)
      : [],
    partners: may("partner.read")
      ? Object.entries(PARTNER_NAMES).map(([id, name]) => ({ id, name })).filter((p) => contains(p.name, q)).sort(byName).slice(0, LIMIT)
      : [],
    articles: ARTICLES.filter((a) => contains(a.title, q)).sort((a, b) => a.title.localeCompare(b.title)).slice(0, LIMIT),
  };
}
