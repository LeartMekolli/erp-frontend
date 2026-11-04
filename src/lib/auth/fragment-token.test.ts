import { afterEach, describe, expect, it } from "vitest";

import { clearFragment, readFragmentToken } from "./fragment-token";

const goTo = (url: string) => window.history.replaceState(null, "", url);
const here = () => window.location.pathname + window.location.search + window.location.hash;

afterEach(() => goTo("/"));

describe("readFragmentToken", () => {
  it("returns the token without touching the address", () => {
    goTo("/reset-password?from=email#token=abc.def");
    expect(readFragmentToken()).toBe("abc.def");
    expect(here()).toBe("/reset-password?from=email#token=abc.def");
  });

  it("decodes a percent-encoded token", () => {
    goTo("/reset-password#token=a%2Bb");
    expect(readFragmentToken()).toBe("a+b");
  });

  it("returns null without a fragment, or with an empty token", () => {
    goTo("/reset-password");
    expect(readFragmentToken()).toBeNull();
    goTo("/reset-password#token=");
    expect(readFragmentToken()).toBeNull();
  });
});

describe("clearFragment", () => {
  it("removes the fragment, keeping the path and query", () => {
    goTo("/reset-password?from=email#token=abc.def");
    clearFragment();
    expect(here()).toBe("/reset-password?from=email");
    expect(readFragmentToken()).toBeNull();
  });

  it("leaves an address without a fragment alone", () => {
    goTo("/reset-password?from=email");
    clearFragment();
    expect(here()).toBe("/reset-password?from=email");
  });
});
