import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScoreRing } from "./score-ring";
import { CHART } from "./tokens";

describe("ScoreRing", () => {
  it("shows the score to one decimal, out of 5", () => {
    const { container } = render(<ScoreRing score={4.4} />);
    expect(screen.getByRole("img", { name: "Score 4.4 out of 5" })).toBeTruthy();
    expect(screen.getByText("4.4")).toBeTruthy();
    expect(screen.getByText("out of 5")).toBeTruthy();
    expect(container.querySelector("[data-arc]")?.getAttribute("stroke")).toBe(CHART.violet);
  });

  it("is an empty ring reading New without a score", () => {
    const { container } = render(<ScoreRing score={null} />);
    expect(screen.getByRole("img", { name: "No score yet" })).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    expect(container.querySelector("[data-arc]")).toBeNull();
  });
});
