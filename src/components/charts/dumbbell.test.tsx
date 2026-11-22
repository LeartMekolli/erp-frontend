import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dumbbell } from "./dumbbell";

function renderDumbbell(data: { key: string; label: string; before: number | null; now: number }[]) {
  return render(<Dumbbell label="Where time goes" data={data} unit="h" width={420} />);
}

describe("Dumbbell", () => {
  it("marks a slower step with a triangle", () => {
    renderDumbbell([{ key: "casting", label: "Casting", before: 17, now: 22 }]);
    expect(screen.getByText("22h ▲")).toBeTruthy();
  });

  it("shows a faster step without a triangle", () => {
    const { container } = renderDumbbell([
      { key: "polishing", label: "Polishing", before: 12, now: 9 },
    ]);
    expect(screen.getByText("9h", { selector: "span" })).toBeTruthy();
    expect(container.textContent).not.toContain("▲");
  });

  it("draws only the now dot when there is no before", () => {
    const { container } = renderDumbbell([{ key: "packing", label: "Packing", before: null, now: 4 }]);
    expect(container.querySelectorAll("[data-row] circle[data-dot]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-row] line")).toHaveLength(0);
  });

  it("reads No data for a missing before in the table", () => {
    renderDumbbell([{ key: "packing", label: "Packing", before: null, now: 4 }]);
    expect(screen.getByRole("cell", { name: "No data" })).toBeTruthy();
  });
});
