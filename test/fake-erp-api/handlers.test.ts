import { describe, expect, it } from "vitest";

import { FAKE_API_URL, FAKE_PASSWORD, STAFF, WORKSPACE } from "./seed";
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

  it("puts a short password on the password field", async () => {
    const res = await post("/auth/password-reset/confirm", { token: "x", password: "short" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ type: "urn:problem:validation", errors: [{ path: "password" }] });
  });
});
