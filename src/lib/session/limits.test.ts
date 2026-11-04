import { describe, expect, it } from "vitest";

import { ABSOLUTE_LIMIT_MS, IDLE_LIMIT_MS, checkLimits } from "./limits";

const H = 60 * 60 * 1000;

describe("checkLimits", () => {
  it("uses 3 hours idle and 12 hours in total", () => {
    expect(IDLE_LIMIT_MS).toBe(3 * H);
    expect(ABSOLUTE_LIMIT_MS).toBe(12 * H);
  });

  it("is ok inside both limits", () => {
    expect(checkLimits({ signedInAt: 0, lastActiveAt: 2 * H }, 4 * H)).toBe("ok");
  });

  it("is idle after 3 hours without activity", () => {
    expect(checkLimits({ signedInAt: 0, lastActiveAt: 1 * H }, 4.5 * H)).toBe("idle");
  });

  it("is idle at exactly 3 hours", () => {
    expect(checkLimits({ signedInAt: 0, lastActiveAt: 1 * H }, 4 * H)).toBe("idle");
    expect(checkLimits({ signedInAt: 0, lastActiveAt: 1 * H }, 4 * H - 1)).toBe("ok");
  });

  it("is expired 12 hours after sign-in even when active", () => {
    expect(checkLimits({ signedInAt: 0, lastActiveAt: 12 * H }, 12 * H)).toBe("expired");
  });

  it("reports expired over idle when both have passed", () => {
    expect(checkLimits({ signedInAt: 0, lastActiveAt: 0 }, 13 * H)).toBe("expired");
  });
});
