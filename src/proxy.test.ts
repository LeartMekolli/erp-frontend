// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("proxy", () => {
  it("moves a workspace-prefixed link to AMI's own path and remembers the workspace", () => {
    const res = proxy(new NextRequest("http://localhost:3001/demo/accept-invitation?from=email"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3001/accept-invitation?from=email");
    expect(res.headers.getSetCookie().find((c) => c.startsWith("ami_workspace_hint="))).toMatch(
      /^ami_workspace_hint=demo;.*SameSite=lax/i,
    );
  });

  it("lets AMI's own routes through untouched", () => {
    const res = proxy(new NextRequest("http://localhost:3001/partner-portal/abc"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
