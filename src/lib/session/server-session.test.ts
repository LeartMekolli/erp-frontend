// @vitest-environment node
// Server-only code: run it where it runs, not in jsdom.
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE, openSession, sealSession, sessionCookieOptions, type ServerSession } from "./server-session";

const session: ServerSession = {
  refreshToken: "r",
  workspace: "demo",
  kind: "staff",
  partnerIds: [],
  signedInAt: 1,
  lastActiveAt: 2,
};

describe("server session", () => {
  it("round-trips a sealed session", async () => {
    expect(await openSession(await sealSession(session))).toEqual(session);
  });

  it("encrypts the cookie value, so the refresh token can't be read from it", async () => {
    const sealed = await sealSession({ ...session, refreshToken: "secret-refresh-token" });
    expect(sealed.split(".")).toHaveLength(5); // JWE compact: header, key, iv, ciphertext, tag
    expect(sealed).not.toContain("secret-refresh-token");
  });

  it("rejects a cookie sealed with another key", async () => {
    const { CompactEncrypt } = await import("jose");
    const otherKey = new Uint8Array(32).fill(7);
    const foreign = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(session)))
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(otherKey);
    expect(await openSession(foreign)).toBeNull();
  });

  it("rejects a tampered cookie", async () => {
    const sealed = await sealSession(session);
    expect(await openSession(sealed.slice(0, -2) + "xx")).toBeNull();
  });

  it("rejects a missing or malformed cookie", async () => {
    expect(await openSession(undefined)).toBeNull();
    expect(await openSession("not-a-cookie")).toBeNull();
  });

  it("names the cookie ami_session", () => {
    expect(SESSION_COOKIE).toBe("ami_session");
  });

  it("is HttpOnly, SameSite=Strict and has no expiry", () => {
    const options = sessionCookieOptions(new URL("https://ami.example/"));
    expect(options).toEqual({ httpOnly: true, secure: true, sameSite: "strict", path: "/" });
  });

  it("drops Secure only on localhost", () => {
    expect(sessionCookieOptions(new URL("http://localhost:3001/")).secure).toBe(false);
    expect(sessionCookieOptions(new URL("http://127.0.0.1:3001/")).secure).toBe(false);
    expect(sessionCookieOptions(new URL("https://ami.example/")).secure).toBe(true);
  });
});
