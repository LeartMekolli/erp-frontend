import { afterEach, describe, expect, it } from "vitest";

import { SIGNED_OUT_COOKIE, clearSignedOut, markSignedOut } from "./auth-note";

const cookieValue = () =>
  document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${SIGNED_OUT_COOKIE}=`))
    ?.slice(SIGNED_OUT_COOKIE.length + 1);

afterEach(() => clearSignedOut());

describe("the signed-out mark", () => {
  it("is set, then cleared", () => {
    expect(cookieValue()).toBeUndefined();
    markSignedOut();
    expect(cookieValue()).toBe("1");
    clearSignedOut();
    expect(cookieValue()).toBeUndefined();
  });
});
