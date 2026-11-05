import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, FAKE_PASSWORD, STAFF, WORKSPACE } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";

import { createApiClient } from "./client";
import { idempotent } from "./idempotency";
import type { PartnerPaths } from "./schema-types";

let authHeaders: (string | null)[] = [];
beforeEach(() => {
  authHeaders = [];
  server.events.on("request:start", ({ request }) => {
    authHeaders.push(request.headers.get("authorization"));
  });
});
afterEach(() => server.events.removeAllListeners());

function validToken(): string {
  const tokens = fakeState().login(WORKSPACE, STAFF.email, FAKE_PASSWORD);
  if ("status" in tokens) throw new Error("fake login failed");
  return tokens.access_token;
}

describe("api client", () => {
  it("adds the bearer token", async () => {
    const token = validToken();
    const api = createApiClient({ getAccessToken: async () => token }, FAKE_API_URL);
    const { data } = await api.GET("/me");
    expect(data?.user.email).toBe(STAFF.email);
    expect(authHeaders).toEqual([`Bearer ${token}`]);
  });

  it("retries once with a forced refresh after a 401", async () => {
    const token = validToken();
    const getAccessToken = vi.fn(async (options?: { force?: boolean }) => (options?.force ? token : "stale"));
    const api = createApiClient({ getAccessToken }, FAKE_API_URL);
    const { data, response } = await api.GET("/me");
    expect(response.status).toBe(200);
    expect(data?.user.email).toBe(STAFF.email);
    expect(getAccessToken).toHaveBeenCalledWith({ force: true });
    expect(authHeaders).toEqual(["Bearer stale", `Bearer ${token}`]);
  });

  it("gives up after one retry", async () => {
    const getAccessToken = vi.fn(async () => "still-stale");
    const api = createApiClient({ getAccessToken }, FAKE_API_URL);
    const { response } = await api.GET("/me");
    expect(response.status).toBe(401);
    expect(authHeaders).toHaveLength(2);
  });

  it("sends no token and never refreshes for /auth/ routes", async () => {
    const getAccessToken = vi.fn(async () => "unused");
    const api = createApiClient({ getAccessToken }, FAKE_API_URL);
    await api.POST("/auth/password-reset", { body: { email: STAFF.email, workspace: WORKSPACE } });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(authHeaders).toEqual([null]);
  });

  it("keeps the Idempotency-Key on the 401 retry", async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post(`${FAKE_API_URL}/roles`, ({ request }) => {
        keys.push(request.headers.get("idempotency-key"));
        return request.headers.get("authorization") === "Bearer fresh"
          ? new HttpResponse(null, { status: 201 })
          : HttpResponse.json({ type: "about:blank", title: "Unauthorized", status: 401 }, { status: 401 });
      }),
    );
    const api = createApiClient(
      { getAccessToken: async (options) => (options?.force ? "fresh" : "stale") },
      FAKE_API_URL,
    );
    const { response } = await api.POST("/roles", { body: { name: "Packers", permissions: [] }, ...idempotent("k1") });
    expect(response.status).toBe(201);
    expect(keys).toEqual(["k1", "k1"]);
  });

  it("gives partner pages no staff routes", () => {
    const partner = createApiClient<PartnerPaths>({ getAccessToken: async () => "unused" }, FAKE_API_URL);
    // Never called: the check is the type error below, which `npm run typecheck` enforces.
    const staffCall = () =>
      // @ts-expect-error: /orders is a staff route
      partner.GET("/orders");
    expect(typeof staffCall).toBe("function");
  });
});
