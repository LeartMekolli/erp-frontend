import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/sign-in",
    "/sign-in?next=/orders",
    "/forgot-password",
    "/reset-password",
    "/accept-invitation",
    "/orders/1\nSet-Cookie: x",
    "orders/1",
    "",
    null,
  ])("rejects %j", (next) => {
    expect(safeNext(next, "/")).toBe("/");
  });

  it("keeps a same-origin path with its query and hash", () => {
    expect(safeNext("/orders/123?tab=lines#notes", "/")).toBe("/orders/123?tab=lines#notes");
  });

  it("keeps a partner portal path", () => {
    expect(safeNext("/partner-portal/abc/jobs", "/")).toBe("/partner-portal/abc/jobs");
  });

  it("uses the given fallback", () => {
    expect(safeNext("//evil.example", "/partner-portal/abc")).toBe("/partner-portal/abc");
  });
});
