import { describe, expect, it } from "vitest";

import type { CatalogProduct, CustomerAddresses, SpeedChoice } from "../../src/lib/api/schema-types";

import { CAST_RING_ID, DRAFT_PRODUCT_ID, GIFT_SET_ID, LUNA_LOGO_ID, NAMEPLATE_ID } from "./catalog";
import { FAKE_API_URL, FAKE_PASSWORD, LUNA_ID, MIRA_ID, ORDER_TAKER, WORKSPACE, type FakeUser } from "./seed";

async function get(user: FakeUser, path: string) {
  const login = await fetch(`${FAKE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: WORKSPACE, email: user.email, password: FAKE_PASSWORD }),
  });
  const { access_token } = (await login.json()) as { access_token: string };
  return fetch(`${FAKE_API_URL}${path}`, { headers: { authorization: `Bearer ${access_token}` } });
}

async function productIds(customerId: string): Promise<string[]> {
  const res = await get(ORDER_TAKER, `/catalog/products?customer_id=${customerId}&limit=200`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data: CatalogProduct[]; next_cursor: string | null };
  expect(body.next_cursor).toBeNull();
  return body.data.map((product) => product.id);
}

describe("fake erp-api catalog, customers and speeds", () => {
  it("lists only what Luna can see", async () => {
    const ids = await productIds(LUNA_ID);
    expect(ids).toEqual([CAST_RING_ID, NAMEPLATE_ID, GIFT_SET_ID, LUNA_LOGO_ID]);
    expect(ids).not.toContain(DRAFT_PRODUCT_ID);
  });

  it("hides Luna's own product from Mira", async () => {
    const ids = await productIds(MIRA_ID);
    expect(ids).toEqual([CAST_RING_ID, NAMEPLATE_ID, GIFT_SET_ID]);
  });

  it("answers 404 for an unknown customer", async () => {
    const res = await get(ORDER_TAKER, "/catalog/products?customer_id=9a9a9a9a-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ detail: "Customer not found" });
  });

  it("offers Mira only her plan's speeds", async () => {
    const res = await get(ORDER_TAKER, `/pricing/quotes/delivery-speeds?customer_id=${MIRA_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SpeedChoice[] };
    expect(body.data.map((speed) => speed.key)).toEqual(["standard"]);
  });

  it("has no saved address for Mira", async () => {
    const res = await get(ORDER_TAKER, `/customers/${MIRA_ID}/addresses`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CustomerAddresses;
    expect(body.shipping_address).toBeNull();
    expect(body.billing_address).toBeNull();
  });
});
