import { describe, expect, it } from "vitest";

import { splitWorkspacePrefix } from "./routes";

describe("splitWorkspacePrefix", () => {
  it("strips a workspace", () => {
    expect(splitWorkspacePrefix("/demo/accept-invitation")).toEqual({ workspace: "demo", path: "/accept-invitation" });
  });

  it("strips a workspace from a deep link", () => {
    expect(splitWorkspacePrefix("/demo/partner-portal/abc/jobs")).toEqual({
      workspace: "demo",
      path: "/partner-portal/abc/jobs",
    });
  });

  it("handles the bare workspace", () => {
    expect(splitWorkspacePrefix("/demo")).toEqual({ workspace: "demo", path: "/" });
    expect(splitWorkspacePrefix("/demo/")).toEqual({ workspace: "demo", path: "/" });
  });

  it.each(["/", "/sign-in", "/partner-portal/abc", "/orders/1", "/billing", "/session/refresh", "/accept-invitation"])(
    "keeps AMI's own route %s",
    (path) => {
      expect(splitWorkspacePrefix(path)).toEqual({ workspace: null, path });
    },
  );

  it.each(["/Demo/x", "/demo_1/x", "/-demo/x", "/demo-/x", `/${"a".repeat(64)}/x`])("ignores the invalid slug in %s", (path) => {
    expect(splitWorkspacePrefix(path)).toEqual({ workspace: null, path });
  });
});
