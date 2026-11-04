import { afterEach, describe, expect, it } from "vitest";

import { takeFragmentToken } from "./fragment-token";

const goTo = (url: string) => window.history.replaceState(null, "", url);
const here = () => window.location.pathname + window.location.search + window.location.hash;

afterEach(() => goTo("/"));

describe("takeFragmentToken", () => {
  it("returns the token and removes it from the address, keeping the path and query", () => {
    goTo("/reset-password?from=email#token=abc.def");
    expect(takeFragmentToken()).toBe("abc.def");
    expect(here()).toBe("/reset-password?from=email");
  });

  it("decodes a percent-encoded token", () => {
    goTo("/reset-password#token=a%2Bb");
    expect(takeFragmentToken()).toBe("a+b");
  });

  it("returns null and leaves the address alone without a fragment", () => {
    goTo("/reset-password?from=email");
    expect(takeFragmentToken()).toBeNull();
    expect(here()).toBe("/reset-password?from=email");
  });

  it("returns null for an empty token, and still clears the fragment", () => {
    goTo("/reset-password#token=");
    expect(takeFragmentToken()).toBeNull();
    expect(here()).toBe("/reset-password");
  });

  it("returns null once the token has been taken", () => {
    goTo("/reset-password#token=abc.def");
    takeFragmentToken();
    expect(takeFragmentToken()).toBeNull();
  });
});
