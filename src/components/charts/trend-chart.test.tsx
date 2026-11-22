import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TrendChart, type TrendPoint } from "./trend-chart";

const format = (v: number) => `EUR ${v}`;
const axis = (v: number) => `${v}`;
const dateLabel = (iso: string) => `Day ${iso.slice(8)}`;

function days(count: number, overrides: Record<number, Partial<TrendPoint>> = {}): TrendPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    at: `2026-11-${String(i + 1).padStart(2, "0")}`,
    value: (i + 1) * 100,
    previous: (i + 1) * 50,
    ...overrides[i],
  }));
}

function renderChart(points: TrendPoint[], extra: { empty?: string } = {}) {
  return render(
    <TrendChart
      label="Revenue by day"
      points={points}
      tone="light"
      height={260}
      width={760}
      format={format}
      axis={axis}
      dateLabel={dateLabel}
      {...extra}
    />,
  );
}

describe("TrendChart", () => {
  it("has a table row per point with date, value and previous", () => {
    renderChart(days(30));
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(31);
    expect(within(rows[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Day 01",
      "EUR 100",
      "EUR 50",
    ]);
    expect(within(rows[30]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Day 30",
      "EUR 3000",
      "EUR 1500",
    ]);
  });

  it("drops the Previous column when no point has one", () => {
    renderChart(days(3).map(({ at, value }) => ({ at, value })));
    expect(screen.queryByRole("columnheader", { name: "Previous" })).toBeNull();
  });

  it("reads the second point in the tooltip after two ArrowRight presses", async () => {
    const user = userEvent.setup();
    const { container } = renderChart(days(30));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("figure", { name: "Revenue by day" }));
    await user.keyboard("{ArrowRight}{ArrowRight}");
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("Day 02");
    expect(live?.textContent).toContain("EUR 200");
    expect(live?.textContent).toContain("EUR 100");
    expect(live?.textContent).toContain("▲ 100%");
  });

  it("shows No data in the tooltip for a missing value", async () => {
    const user = userEvent.setup();
    const { container } = renderChart(days(5, { 0: { value: null } }));
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("No data");
  });

  it("breaks the current line at a missing value", () => {
    const { container } = renderChart(days(30, { 10: { value: null } }));
    expect(container.querySelectorAll('path[data-series="current"]')).toHaveLength(2);
  });

  it("draws one current line when every value is present", () => {
    const { container } = renderChart(days(30));
    expect(container.querySelectorAll('path[data-series="current"]')).toHaveLength(1);
  });

  it("draws the end dot at least 4px in radius with a surface ring", () => {
    const { container } = render(
      <TrendChart
        label="Revenue by day"
        points={days(5)}
        tone="light"
        height={260}
        width={760}
        format={format}
        axis={axis}
        dateLabel={dateLabel}
        endLabel
      />,
    );
    const dot = container.querySelector("circle[data-end-dot]");
    expect(Number(dot?.getAttribute("r"))).toBeGreaterThanOrEqual(4);
    expect(dot?.getAttribute("stroke")).toBe("#ffffff");
    expect(dot?.getAttribute("stroke-width")).toBe("2");
  });

  it("shows the empty caption and draws no line", () => {
    const { container } = renderChart([], { empty: "No orders in these 30 days" });
    expect(screen.getByText("No orders in these 30 days")).toBeTruthy();
    expect(container.querySelectorAll('path[data-series="current"]')).toHaveLength(0);
  });
});
