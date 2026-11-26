import { describe, expect, it } from "vitest";

import { FAKE_API_URL, FAKE_PASSWORD, FLOOR_WORKER, LUNA_ID, MIRA_ID, ORDER_TAKER, SALES_LEAD, STAFF, WORKSPACE } from "./seed";
import { fakeState } from "./state";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${FAKE_API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("fake erp-api handlers", () => {
  it("signs in and answers /me with the access token", async () => {
    const login = await post("/auth/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD });
    expect(login.status).toBe(200);
    const { access_token } = (await login.json()) as { access_token: string };
    const me = await fetch(`${FAKE_API_URL}/me`, { headers: { authorization: `Bearer ${access_token}` } });
    expect(await me.json()).toMatchObject({ user: { email: STAFF.email } });
  });

  it("answers a failed login as problem+json", async () => {
    const res = await post("/auth/login", { workspace: WORKSPACE, email: STAFF.email, password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toEqual({ type: "about:blank", title: "Unauthorized", status: 401, detail: "Invalid credentials" });
  });

  it("refuses a comment with visibility", async () => {
    const login = await post("/auth/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD });
    const { access_token } = (await login.json()) as { access_token: string };
    const orderId = fakeState().orders.all().find((order) => order.number === 1049)!.id;
    const res = await post(`/orders/${orderId}/comments`, { body: "Ready on Friday", visibility: "staff" }, { authorization: `Bearer ${access_token}` });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ type: "urn:problem:validation", errors: [{ path: "visibility", message: 'Unrecognized key: "visibility"' }] });
    const answer = fakeState().comments.list(orderId, new URLSearchParams());
    expect(answer.ok && answer.body.data).toEqual([]);
  });

  it("saves nothing when a comment would reach other readers than staff were told", async () => {
    const login = await post("/auth/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD });
    const { access_token } = (await login.json()) as { access_token: string };
    const order = fakeState().orders.all().find((candidate) => candidate.number === 1048)!;
    const line = order.lines[0]!;
    const before = fakeState().comments.list(order.id, new URLSearchParams());
    const res = await post(`/orders/${order.id}/comments`, { body: "Keep the price low", line_id: line.id, readers: "staff" }, { authorization: `Bearer ${access_token}` });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "readers_changed", partner: { id: line.partner!.id, name: "Northcast Foundry" } });
    expect(fakeState().comments.list(order.id, new URLSearchParams())).toEqual(before);

    const right = await post(`/orders/${order.id}/comments`, { body: "Matte, please", line_id: line.id, readers: line.partner!.id }, { authorization: `Bearer ${access_token}` });
    expect(right.status).toBe(201);
  });

  it("lists who has moved to anyone with workflow.read, Floor included", async () => {
    const actors = async (email: string) => {
      const login = await post("/auth/login", { workspace: WORKSPACE, email, password: FAKE_PASSWORD });
      const { access_token } = (await login.json()) as { access_token: string };
      return fetch(`${FAKE_API_URL}/workflow/moves/actors`, { headers: { authorization: `Bearer ${access_token}` } });
    };
    const floor = await actors(FLOOR_WORKER.email);
    expect(floor.status).toBe(200);
    expect(await floor.json()).toMatchObject({ data: [{ name: "Ana Ruiz", kind: "staff", partners: [] }] });
    expect((await actors(SALES_LEAD.email)).status).toBe(403);
  });

  it("asks each customer route for its own permission", async () => {
    const call = async (email: string, method: string, path: string, body?: unknown) => {
      const login = await post("/auth/login", { workspace: WORKSPACE, email, password: FAKE_PASSWORD });
      const { access_token } = (await login.json()) as { access_token: string };
      return fetch(`${FAKE_API_URL}${path}`, {
        method,
        headers: { authorization: `Bearer ${access_token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    };
    // SALES_LEAD reads customers and payments but changes nothing; ORDER_TAKER can't read payments.
    expect((await call(SALES_LEAD.email, "PATCH", `/customers/${LUNA_ID}`, { name: "Luna" })).status).toBe(403);
    expect((await call(SALES_LEAD.email, "PUT", `/customers/${LUNA_ID}/addresses`, { vat_number: null })).status).toBe(403);
    expect((await call(SALES_LEAD.email, "PUT", `/customers/${MIRA_ID}/payment-terms`, { terms: "pay_first" })).status).toBe(403);
    expect((await call(ORDER_TAKER.email, "GET", `/payments/customers/${MIRA_ID}`)).status).toBe(403);
    expect((await call(SALES_LEAD.email, "GET", "/customers/groups")).status).toBe(200);
    expect((await call(SALES_LEAD.email, "GET", "/customers/bands")).status).toBe(200);
    expect((await call(SALES_LEAD.email, "GET", "/customers?status=active&q=mira")).status).toBe(200);
    expect((await call(FLOOR_WORKER.email, "GET", "/customers")).status).toBe(403);

    const renamed = await call(STAFF.email, "PATCH", `/customers/${LUNA_ID}`, { name: "Luna Atelier" });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ name: "Luna Atelier" });
    expect((await call(STAFF.email, "PUT", `/customers/${MIRA_ID}/payment-terms`, { terms: "pay_later", credit_limit: "5,000.00" })).status).toBe(400);
  });

  it("puts a short password on the password field", async () => {
    const res = await post("/auth/password-reset/confirm", { token: "x", password: "short" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ type: "urn:problem:validation", errors: [{ path: "password" }] });
  });
});
