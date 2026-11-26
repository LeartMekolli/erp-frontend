import { describe, expect, it } from "vitest";

import { skillWords } from "./holds";

describe("skillWords", () => {
  it("names the skill erp-api says is missing", () => {
    expect(skillWords({ name: "Final QC" })).toBe("Needs the Final QC skill");
  });

  it("falls back to plain words when erp-api names none", () => {
    expect(skillWords(null)).toBe("Needs a skill you don't have");
  });
});
