import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CalendarHeatmap } from "./calendar-heatmap";
import { CHART } from "./tokens";

const dateLabel = (iso: string) => iso.slice(5);

const days = [
  { on: "2026-01-05", count: 2 },
  { on: "2026-03-10", count: 9 },
  { on: "2026-11-20", count: 1 },
];

function renderHeatmap(overrides: Partial<Parameters<typeof CalendarHeatmap>[0]> = {}) {
  return render(
    <CalendarHeatmap
      label="Orders by day"
      year={2026}
      days={days}
      today="2026-11-22"
      dateLabel={dateLabel}
      width={760}
      {...overrides}
    />,
  );
}

function fillOf(container: HTMLElement, day: string) {
  return container.querySelector(`rect[data-day="${day}"]`)?.getAttribute("fill");
}

describe("CalendarHeatmap", () => {
  it("lists only the counted days in the table", () => {
    renderHeatmap();
    // Header row plus the three counted days.
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("gives future days no hit area and no tooltip", () => {
    const { container } = renderHeatmap();
    expect(container.querySelector('rect[data-day="2026-12-01"]')?.hasAttribute("data-future")).toBe(
      true,
    );
    expect(container.querySelector('rect[data-hit="2026-12-01"]')).toBeNull();
    expect(container.querySelector('rect[data-hit="2026-11-22"]')).not.toBeNull();
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  });

  it("shows the day and its count when the pointer moves over a cell", () => {
    const { container } = renderHeatmap();
    const hit = container.querySelector('rect[data-hit="2026-03-10"]');
    expect(hit).not.toBeNull();
    fireEvent.pointerMove(hit as Element);
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(within(live).getByText("03-10")).toBeTruthy();
    expect(within(live).getByText("Orders")).toBeTruthy();
    expect(within(live).getByText("9")).toBeTruthy();
  });

  it("steps by day with left and right, and by week with up and down", async () => {
    const user = userEvent.setup();
    const { container } = renderHeatmap();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("figure", { name: "Orders by day" }));

    await user.keyboard("{ArrowRight}");
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(within(live).getByText("01-01")).toBeTruthy();

    // 5 January 2026 is a Monday.
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(within(live).getByText("01-05")).toBeTruthy();
    expect(within(live).getByText("Orders")).toBeTruthy();
    expect(within(live).getByText("2")).toBeTruthy();

    await user.keyboard("{ArrowDown}");
    expect(within(live).getByText("01-12")).toBeTruthy();
    expect(within(live).getByText("0")).toBeTruthy();
  });

  it("jumps to the first day and to today, never past today, and clears on Escape", async () => {
    const user = userEvent.setup();
    const { container } = renderHeatmap();
    await user.tab();
    const live = container.querySelector('[aria-live="polite"]');

    await user.keyboard("{End}");
    expect(live?.textContent).toContain("11-22");
    await user.keyboard("{ArrowRight}");
    expect(live?.textContent).toContain("11-22");
    await user.keyboard("{ArrowDown}");
    expect(live?.textContent).toContain("11-22");

    await user.keyboard("{Home}");
    expect(live?.textContent).toContain("01-01");
    await user.keyboard("{ArrowLeft}");
    expect(live?.textContent).toContain("01-01");

    await user.keyboard("{Escape}");
    expect(live?.textContent).toBe("");
  });

  it("starts at today when the first key is left or up", async () => {
    const user = userEvent.setup();
    const { container } = renderHeatmap();
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("11-22");
  });

  it("colours counted days from the ramp, empty past days lightest and future days apart", () => {
    const { container } = renderHeatmap();
    expect(fillOf(container, "2026-03-10")).toBe(CHART.ramp[5]);
    expect(fillOf(container, "2026-02-02")).toBe(CHART.ramp[0]);
    expect(fillOf(container, "2026-12-24")).toBe(CHART.future);
  });

  it("rings today's cell, and draws no ring when today is outside the year", () => {
    const { container, unmount } = renderHeatmap();
    const rings = container.querySelectorAll("rect[data-today]");
    expect(rings).toHaveLength(1);
    const cell = container.querySelector('rect[data-day="2026-11-22"]');
    expect(rings[0].getAttribute("x")).toBe(cell?.getAttribute("x"));
    expect(rings[0].getAttribute("y")).toBe(cell?.getAttribute("y"));
    expect(rings[0].getAttribute("stroke")).toBe(CHART.axis);
    expect(rings[0].getAttribute("stroke-width")).toBe("1.5");
    unmount();

    const other = renderHeatmap({ today: "2027-03-01" });
    expect(other.container.querySelector("rect[data-today]")).toBeNull();
  });

  it("shows a lone order in the darkest step", () => {
    const { container } = renderHeatmap({ days: [{ on: "2026-03-10", count: 1 }] });
    expect(fillOf(container, "2026-03-10")).toBe(CHART.ramp[5]);
  });

  it("places 1 January 2026, a Thursday, in the first column on the fourth row", () => {
    const { container } = renderHeatmap();
    const jan1 = container.querySelector('rect[data-day="2026-01-01"]');
    const jan5 = container.querySelector('rect[data-day="2026-01-05"]');
    const jan2 = container.querySelector('rect[data-day="2026-01-02"]');
    expect(jan1).not.toBeNull();
    // Monday 5 January starts the second week, level with the top row.
    expect(Number(jan5?.getAttribute("x"))).toBeGreaterThan(Number(jan1?.getAttribute("x")));
    expect(Number(jan5?.getAttribute("y"))).toBeLessThan(Number(jan1?.getAttribute("y")));
    // Friday 2 January sits in the same column, one row below.
    expect(jan2?.getAttribute("x")).toBe(jan1?.getAttribute("x"));
    expect(Number(jan2?.getAttribute("y"))).toBeGreaterThan(Number(jan1?.getAttribute("y")));
  });

  it("shows the empty caption, takes no tab stop and has no hit areas without days", () => {
    const { container } = renderHeatmap({ days: [], empty: "No orders this year" });
    expect(screen.getByText("No orders this year")).toBeTruthy();
    expect(screen.getByText("Orders by day", { selector: "caption" })).toBeTruthy();
    expect(screen.getByRole("figure").hasAttribute("tabindex")).toBe(false);
    expect(container.querySelectorAll("rect[data-hit]")).toHaveLength(0);
    expect(container.querySelectorAll("rect[data-day]").length).toBe(365);
  });
});

describe("CalendarHeatmap on a phone", () => {
  // 340px fits 28 weeks at the 8px floor: Monday 11 May to Sunday 22 Nov, the week of today.
  const renderNarrow = (fitToWidth: boolean) => renderHeatmap({ width: 340, fitToWidth });

  it("draws only the latest weeks that fit, ending with this week", () => {
    const { container } = renderNarrow(true);
    expect(container.querySelectorAll("rect[data-day]")).toHaveLength(28 * 7);
    expect(fillOf(container, "2026-05-10")).toBeUndefined();
    expect(fillOf(container, "2026-05-11")).toBeDefined();
    expect(container.querySelector('rect[data-today="2026-11-22"]')).not.toBeNull();
    expect(fillOf(container, "2026-11-23")).toBeUndefined();
  });

  it("keeps the whole year in the table, and the keys on the days drawn", async () => {
    renderNarrow(true);
    expect(screen.getAllByRole("row")).toHaveLength(4);
    screen.getByRole("figure").focus();
    await userEvent.keyboard("{Home}");
    expect(await screen.findByText("05-11")).toBeInTheDocument();
  });

  it("still draws the whole year without fitToWidth", () => {
    const { container } = renderNarrow(false);
    expect(container.querySelectorAll("rect[data-day]")).toHaveLength(365);
  });
});
