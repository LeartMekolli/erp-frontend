import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Columns } from "./columns";
import { CHART } from "./tokens";

const format = String;
const axis = (v: number) => `${v}`;

const weeks = Array.from({ length: 12 }, (_, i) => ({
  key: `w${i + 1}`,
  label: `W${i + 1}`,
  values: [i === 11 ? 42 : i + 10],
}));

describe("Columns", () => {
  it("fills only the highlighted column in violet and labels it", () => {
    const { container } = render(
      <Columns
        label="Orders per week"
        data={weeks}
        series={[{ name: "Orders", color: CHART.violet }]}
        highlight={11}
        height={200}
        width={480}
        format={format}
        axis={axis}
      />,
    );
    const columns = container.querySelectorAll("path[data-column]");
    expect(columns).toHaveLength(12);
    expect(container.querySelectorAll(`path[data-column][fill="${CHART.violet}"]`)).toHaveLength(1);
    const labels = Array.from(container.querySelectorAll("svg text")).map((t) => t.textContent);
    expect(labels).toContain("42");
  });

  it("draws no rect for a zero part and lists every series in the legend", () => {
    const { container } = render(
      <Columns
        label="Pieces in production"
        data={[
          { key: "a", label: "Mon", values: [3, 0, 2] },
          { key: "b", label: "Tue", values: [3, 1, 2] },
        ]}
        series={[
          { name: "In house", color: CHART.violet },
          { name: "At a partner", color: CHART.lilac2 },
          { name: "Late", color: CHART.status.late },
        ]}
        height={200}
        width={480}
        format={format}
        axis={axis}
      />,
    );
    const parts = (key: string) =>
      container.querySelectorAll(`[data-datum="${key}"] path[data-part]`);
    expect(parts("a")).toHaveLength(2);
    expect(parts("b")).toHaveLength(3);
    const legend = screen.getByRole("list");
    expect(legend.textContent).toContain("In house");
    expect(legend.textContent).toContain("At a partner");
    expect(legend.textContent).toContain("Late");
  });

  it("shows the first datum in the tooltip after ArrowRight", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Columns
        label="Orders per week"
        data={weeks}
        series={[{ name: "Orders", color: CHART.violet }]}
        highlight={11}
        height={200}
        width={480}
        format={(v) => `${v} orders`}
        axis={axis}
      />,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("figure", { name: "Orders per week" }));
    await user.keyboard("{ArrowRight}");
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("W1");
    expect(live?.textContent).toContain("10 orders");
  });

  it("shows the empty caption, draws no columns and takes no tab stop", () => {
    const { container } = render(
      <Columns
        label="Orders per week"
        data={[]}
        series={[{ name: "Orders", color: CHART.violet }]}
        height={200}
        width={480}
        format={format}
        axis={axis}
        empty="No orders in these 30 days"
      />,
    );
    expect(screen.getByText("No orders in these 30 days")).toBeTruthy();
    expect(screen.getByText("Orders per week", { selector: "caption" })).toBeTruthy();
    expect(container.querySelectorAll("path[data-column]")).toHaveLength(0);
    expect(screen.getByRole("figure").hasAttribute("tabindex")).toBe(false);
  });

  it("keeps the highlighted label when narrow widths thin the labels, dropping a neighbour instead", () => {
    const { container } = render(
      <Columns
        label="Orders per week"
        data={weeks}
        series={[{ name: "Orders", color: CHART.violet }]}
        highlight={11}
        height={200}
        width={200}
        format={format}
        axis={axis}
      />,
    );
    const labels = Array.from(container.querySelectorAll("svg text")).map((t) => t.textContent);
    // Every third label at this width (W1, W4, W7, W10), which would skip W12.
    expect(labels).toContain("W12");
    expect(labels).toContain("W1");
    expect(labels).toContain("W7");
    // W10 sits too close to W12, so it makes way.
    expect(labels).not.toContain("W10");
  });
});
