import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline } from "./sparkline";
import { CHART } from "./tokens";

describe("Sparkline", () => {
  it("exposes an image with its label", () => {
    render(<Sparkline values={[1, 2, 3]} label="Revenue, last 3 days" width={200} />);
    expect(screen.getByRole("img", { name: "Revenue, last 3 days" })).toBeTruthy();
  });

  it("draws the earlier segments gray and the last one violet", () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} label="Revenue" width={200} />);
    const rest = container.querySelector('path[data-segment="rest"]');
    const last = container.querySelector('path[data-segment="last"]');
    expect(rest?.getAttribute("stroke")).toBe(CHART.gray);
    expect(last?.getAttribute("stroke")).toBe(CHART.violet);
  });

  it("ends with a violet dot", () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} label="Revenue" width={200} />);
    expect(container.querySelector("circle")?.getAttribute("fill")).toBe(CHART.violet);
  });

  it("draws no end dot when the last value is missing", () => {
    const { container } = render(<Sparkline values={[1, 2, null]} label="Revenue" width={200} />);
    expect(container.querySelector("circle")).toBeNull();
  });
});
