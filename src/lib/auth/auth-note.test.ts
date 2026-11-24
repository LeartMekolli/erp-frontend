import { afterEach, describe, expect, it } from "vitest";

import { AUTH_NOTE_COOKIE, clearAuthNote, leaveAuthNote, parseAuthNote } from "./auth-note";

const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value));
const cookieValue = () =>
  document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${AUTH_NOTE_COOKIE}=`))
    ?.slice(AUTH_NOTE_COOKIE.length + 1);

afterEach(() => clearAuthNote());

describe("parseAuthNote", () => {
  it("reads back a whole note", () => {
    const note = { reason: "idle", next: "/orders/x", workspace: "demo" } as const;
    expect(parseAuthNote(encode(note))).toEqual(note);
  });

  it("drops an unknown reason and a workspace erp-api wouldn't allow", () => {
    expect(parseAuthNote(encode({ reason: "hacked", workspace: "Not A Slug", next: "/orders" }))).toEqual({ next: "/orders" });
  });

  it("drops a return path that isn't a short string", () => {
    expect(parseAuthNote(encode({ next: 42 }))).toEqual({});
    expect(parseAuthNote(encode({ next: `/${"a".repeat(2048)}` }))).toEqual({});
  });

  it("gives an empty note for nothing, junk or JSON that isn't an object", () => {
    expect(parseAuthNote(undefined)).toEqual({});
    expect(parseAuthNote("%%%")).toEqual({});
    expect(parseAuthNote(encode([1]))).toEqual({});
    expect(parseAuthNote(encode(null))).toEqual({});
  });
});

describe("leaveAuthNote and clearAuthNote", () => {
  it("writes the note to the cookie, then removes it", () => {
    leaveAuthNote({ reason: "signed-out" });
    expect(parseAuthNote(cookieValue())).toEqual({ reason: "signed-out" });
    clearAuthNote();
    expect(cookieValue()).toBeUndefined();
  });

  it("replaces the note left before", () => {
    leaveAuthNote({ reason: "idle", next: "/orders" });
    leaveAuthNote({ workspace: "demo" });
    expect(parseAuthNote(cookieValue())).toEqual({ workspace: "demo" });
  });
});
