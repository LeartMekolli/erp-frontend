import { afterEach, describe, expect, it, vi } from "vitest";

import { browserApiUrl, serverApiUrl } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("api config", () => {
  it("reads both addresses", () => {
    vi.stubEnv("ERP_API_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_ERP_API_URL", "http://localhost:3000");
    expect(serverApiUrl()).toBe("http://localhost:3000");
    expect(browserApiUrl()).toBe("http://localhost:3000");
  });

  it("throws a clear error when an address is unset", () => {
    vi.stubEnv("ERP_API_URL", "");
    expect(() => serverApiUrl()).toThrow(/ERP_API_URL/);
  });
});
