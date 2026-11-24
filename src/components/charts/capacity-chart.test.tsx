import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CapacityChart, type CapacityPoint } from "./capacity-chart";

const dateLabel = (iso: string) => iso.slice(5);
const capacityWords = (capacity: number) => `${capacity} a day`;

const points: CapacityPoint[] = [
  { at: "2026-11-01", load: 40, capacity: 50 },
  { at: "2026-11-02", load: 44, capacity: 50 },
  { at: "2026-11-03", load: 52, capacity: 50 },
  { at: "2026-11-04", load: 30, capacity: 50 },
  { at: "2026-11-05", load: 20, capacity: 50 },
];

function renderChart(shown: CapacityPoint[], empty?: string) {
  return render(
    <CapacityChart
      label="Waiting for Casting"
      points={shown}
      capacityWords={capacityWords}
      dateLabel={dateLabel}
      height={220}
      tone="dark"
      width={760}
      empty={empty}
    />,
  );
}

describe("CapacityChart", () => {
  it("says so in the tooltip on a day over capacity", async () => {
    const user = userEvent.setup();
    const { container } = renderChart(points);
    expect(container.querySelectorAll('path[data-series="load"]')).toHaveLength(1);
    expect(container.querySelectorAll('path[data-series="capacity"]')).toHaveLength(1);
    expect(container.querySelectorAll("[data-over]").length).toBeGreaterThan(0);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("figure", { name: "Waiting for Casting" }));
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("11-03");
    expect(live?.textContent).toContain("Waiting52");
    expect(live?.textContent).toContain("Capacity50 a day");
    expect(live?.textContent).toContain("▲ Over your capacity");

    await user.keyboard("{ArrowRight}");
    expect(live?.textContent).not.toContain("Over your capacity");
  });

  it("has a row per day in the table, with the load and the capacity", () => {
    renderChart(points);
    expect(screen.getByRole("columnheader", { name: "Waiting" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Capacity" })).toBeTruthy();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(6);
    expect(rows[3]!.textContent).toContain("52");
    expect(rows[3]!.textContent).toContain("Over your capacity");
  });

  it("labels the capacity once, and again where it changes", () => {
    const { container } = renderChart([
      { at: "2026-11-03", load: 40, capacity: 45 },
      { at: "2026-11-04", load: 47, capacity: 45 },
      { at: "2026-11-05", load: 48, capacity: 50 },
      { at: "2026-11-06", load: 44, capacity: 50 },
    ]);
    const svg = container.querySelector("svg")!;
    expect(svg.textContent).toContain("Capacity 45 a day");
    expect(svg.textContent).toContain("raised to 50 on 11-05");
    expect(svg.textContent?.match(/Capacity /g)).toHaveLength(1);
  });

  it("draws no capacity, and never says over, where the capacity is 0", async () => {
    const user = userEvent.setup();
    const { container } = renderChart([
      { at: "2026-11-01", load: 3, capacity: 0 },
      { at: "2026-11-02", load: 4, capacity: 0 },
    ]);
    expect(container.querySelectorAll('path[data-series="capacity"]')).toHaveLength(0);
    expect(container.querySelectorAll("[data-over]")).toHaveLength(0);
    expect(container.querySelector("svg")!.textContent).not.toContain("Capacity");

    await user.tab();
    await user.keyboard("{ArrowRight}");
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("Waiting3");
    expect(live?.textContent).not.toContain("Over");
  });

  it("shows the empty caption on bare axes, with no line and no tab stop", () => {
    const { container } = renderChart([], "No workload recorded yet");
    expect(screen.getByText("No workload recorded yet")).toBeTruthy();
    expect(container.querySelectorAll('path[data-series="load"]')).toHaveLength(0);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("figure").hasAttribute("tabindex")).toBe(false);
  });
});
