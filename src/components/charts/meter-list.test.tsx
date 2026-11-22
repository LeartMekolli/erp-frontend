import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MeterList } from "./meter-list";
import { CHART } from "./tokens";

const rows = [
  { key: "a", label: "Partner A", value: 0.92, display: "92%", warn: "Near capacity" },
  { key: "b", label: "Partner B", value: 0.4, display: "40%" },
];

function fillColour(row: Element): string {
  return (row.querySelector("[data-fill]") as HTMLElement).style.backgroundColor;
}

function normalised(colour: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = colour;
  return probe.style.backgroundColor;
}

describe("MeterList", () => {
  it("renders the rows in order as list items", () => {
    render(<MeterList label="Partner load" rows={rows} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Partner A");
    expect(items[1].textContent).toContain("Partner B");
  });

  it("says the warning in words and turns only that fill amber", () => {
    const { container } = render(<MeterList label="Partner load" rows={rows} />);
    expect(screen.getByText("▲ Near capacity")).toBeTruthy();
    const [warned, plain] = Array.from(container.querySelectorAll("[data-row]"));
    expect(fillColour(warned)).toBe(normalised(CHART.status.collect));
    expect(fillColour(plain)).toBe(normalised(CHART.violet));
  });

  it("clamps the fill to the track", () => {
    const { container } = render(
      <MeterList label="Partner load" rows={[{ key: "a", label: "Partner A", value: 1.4, display: "140%" }]} />,
    );
    expect((container.querySelector("[data-fill]") as HTMLElement).style.width).toBe("100%");
  });
});
