// @vitest-environment node
import { HttpResponse, http } from "msw";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_COOKIE, openSession, sealSession, type ServerSession } from "@/lib/session/server-session";
import { CUSTOMER, FAKE_API_URL, FAKE_PASSWORD, NO_ACCESS, PARTNER, STAFF, WORKSPACE } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";

import { POST as loginPOST } from "./login/route";
import { POST as logoutPOST } from "./logout/route";
import { POST as refreshPOST } from "./refresh/route";

const ORIGIN = "http://localhost:3001";
const H = 60 * 60 * 1000;

function jsonRequest(
  path: string,
  body: unknown,
  { origin = ORIGIN, cookie, authorization }: { origin?: string; cookie?: string; authorization?: string } = {},
) {
  const headers: Record<string, string> = { origin, "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  if (authorization) headers.authorization = authorization;
  return new NextRequest(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function sessionCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

function cookieValue(setCookie: string): string {
  return setCookie.split(";")[0]!.slice(SESSION_COOKIE.length + 1);
}

/** A session cookie for STAFF with a live erp-api refresh token. */
async function staffSession(times: Partial<ServerSession> = {}) {
  const tokens = fakeState().login(WORKSPACE, STAFF.email, FAKE_PASSWORD);
  if ("status" in tokens) throw new Error("fake login failed");
  const session: ServerSession = {
    refreshToken: tokens.refresh_token,
    workspace: WORKSPACE,
    kind: "staff",
    partnerIds: [],
    signedInAt: Date.now(),
    lastActiveAt: Date.now(),
    ...times,
  };
  return { tokens, session, cookie: await sealSession(session) };
}

let calls: string[] = [];
beforeEach(() => {
  calls = [];
  server.events.on("request:start", ({ request }) => {
    calls.push(`${request.method} ${new URL(request.url).pathname}`);
  });
});
afterEach(() => server.events.removeAllListeners());

describe("POST /session/login", () => {
  it("signs in staff and sets a session cookie with no expiry", async () => {
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ destination: { kind: "staff", path: "/" }, accessToken: expect.any(String), expiresAt: expect.any(String), signedInAt: expect.any(Number) });
    expect(JSON.stringify(body)).not.toMatch(/refresh/i);

    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
    expect(await openSession(cookieValue(cookie))).toMatchObject({ workspace: WORKSPACE, kind: "staff", partnerIds: [] });
  });

  it("remembers the signed-in workspace as the hint", async () => {
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD }));
    expect(res.headers.getSetCookie().find((c) => c.startsWith("ami_workspace_hint="))).toMatch(/^ami_workspace_hint=demo;/);
  });

  it("sends a partner to their portal", async () => {
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: PARTNER.email, password: FAKE_PASSWORD }));
    expect(await res.json()).toMatchObject({ destination: { kind: "partner", partnerId: PARTNER.organisations[0] } });
    expect(await openSession(cookieValue(sessionCookie(res)!))).toMatchObject({ kind: "partner", partnerIds: PARTNER.organisations });
  });

  it("turns a customer away and logs them out at erp-api", async () => {
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: CUSTOMER.email, password: FAKE_PASSWORD }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "customer" });
    expect(sessionCookie(res)).toBeUndefined();
    expect(calls).toContain("POST /auth/logout");
  });

  it("turns away someone with no access and logs them out", async () => {
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: NO_ACCESS.email, password: FAKE_PASSWORD }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no_access" });
    expect(calls).toContain("POST /auth/logout");
  });

  it("maps a wrong password to invalid_credentials", async () => {
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: STAFF.email, password: "wrong-password" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("maps erp-api's 429 to too_many_attempts", async () => {
    for (let i = 0; i < 10; i++) fakeState().login(WORKSPACE, STAFF.email, "wrong");
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_attempts" });
  });

  it("answers api_unreachable when erp-api can't be reached", async () => {
    server.use(http.post(`${FAKE_API_URL}/auth/login`, () => HttpResponse.error()));
    const res = await loginPOST(jsonRequest("/session/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "api_unreachable" });
  });

  it("rejects a cross-origin request", async () => {
    const res = await loginPOST(
      jsonRequest("/session/login", { workspace: WORKSPACE, email: STAFF.email, password: FAKE_PASSWORD }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("rejects a malformed body without calling erp-api", async () => {
    const res = await loginPOST(jsonRequest("/session/login", { email: STAFF.email }));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("POST /session/refresh", () => {
  it("refreshes and rotates the cookie", async () => {
    const { cookie } = await staffSession();
    const res = await refreshPOST(jsonRequest("/session/refresh", {}, { cookie }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accessToken: expect.any(String), signedInAt: expect.any(Number), lastActiveAt: expect.any(Number) });
    const next = sessionCookie(res)!;
    expect(cookieValue(next)).not.toBe(cookie);
  });

  it("answers reason none without a cookie", async () => {
    const res = await refreshPOST(jsonRequest("/session/refresh", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "none" });
  });

  it("ends an idle session and logs it out at erp-api", async () => {
    const { cookie } = await staffSession({ lastActiveAt: Date.now() - 3 * H });
    const res = await refreshPOST(jsonRequest("/session/refresh", {}, { cookie }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "idle" });
    expect(sessionCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(calls).toContain("POST /auth/logout");
  });

  it("counts reported activity before checking idle", async () => {
    const { cookie } = await staffSession({ lastActiveAt: Date.now() - 4 * H });
    const res = await refreshPOST(jsonRequest("/session/refresh", { activeAt: Date.now() - 60_000 }, { cookie }));
    expect(res.status).toBe(200);
  });

  it("never takes reported activity from the future", async () => {
    const { cookie } = await staffSession({ lastActiveAt: Date.now() - 4 * H });
    const res = await refreshPOST(jsonRequest("/session/refresh", { activeAt: Date.now() + 10 * H }, { cookie }));
    const body = await res.json();
    expect(body.lastActiveAt).toBeLessThanOrEqual(Date.now());
  });

  it("ends a session 12 hours after sign-in", async () => {
    const { cookie } = await staffSession({ signedInAt: Date.now() - 12 * H });
    const res = await refreshPOST(jsonRequest("/session/refresh", { activeAt: Date.now() }, { cookie }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "expired" });
  });

  it("answers revoked when erp-api refuses the refresh token", async () => {
    const { cookie, session } = await staffSession();
    fakeState().refresh(session.refreshToken);
    const res = await refreshPOST(jsonRequest("/session/refresh", {}, { cookie }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "revoked" });
    expect(sessionCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("keeps the cookie when erp-api is unreachable", async () => {
    const { cookie } = await staffSession();
    server.use(http.post(`${FAKE_API_URL}/auth/refresh`, () => HttpResponse.error()));
    const res = await refreshPOST(jsonRequest("/session/refresh", {}, { cookie }));
    expect(res.status).toBe(502);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("rejects a cross-origin request", async () => {
    const { cookie } = await staffSession();
    const res = await refreshPOST(jsonRequest("/session/refresh", {}, { cookie, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /session/logout", () => {
  it("logs out at erp-api with the access token and clears the cookie", async () => {
    const { cookie, tokens } = await staffSession();
    const res = await logoutPOST(jsonRequest("/session/logout", {}, { cookie, authorization: `Bearer ${tokens.access_token}` }));
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(fakeState().authenticate(tokens.access_token)).toBeNull();
  });

  it("ends the erp-api session without an access token", async () => {
    const { cookie } = await staffSession();
    const res = await logoutPOST(jsonRequest("/session/logout", {}, { cookie }));
    expect(res.status).toBe(204);
    expect(calls).toEqual(["POST /auth/refresh", "POST /auth/logout"]);
  });

  it("clears the cookie even when erp-api is unreachable", async () => {
    const { cookie, tokens } = await staffSession();
    server.use(http.post(`${FAKE_API_URL}/auth/logout`, () => HttpResponse.error()));
    const res = await logoutPOST(jsonRequest("/session/logout", {}, { cookie, authorization: `Bearer ${tokens.access_token}` }));
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});
