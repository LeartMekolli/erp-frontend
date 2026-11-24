import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CountdownRing } from "./countdown-ring";
import { CHART } from "./tokens";

describe("CountdownRing", () => {
  it("turns the arc and the words late under a quarter of the time left", () => {
    const { container } = render(<CountdownRing left={0.18} text="1h" />);
    expect(container.querySelector("[data-arc]")?.getAttribute("stroke")).toBe(CHART.status.late);
    expect(screen.getByText("1h").className).toContain("text-late-ink");
  });

  it("draws its track in white, so the time used shows on the lilac tile it sits on", () => {
    const { container } = render(<CountdownRing left={0.6} text="5h" />);
    expect(container.querySelector("[data-track]")?.getAttribute("stroke")).toBe(CHART.surface);
  });

  it("stays violet with more time left, the words carrying the meaning", () => {
    const { container } = render(<CountdownRing left={0.6} text="5h" />);
    expect(container.querySelector("[data-arc]")?.getAttribute("stroke")).toBe(CHART.violet);
    expect(screen.getByText("5h").className).not.toContain("text-late-ink");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
