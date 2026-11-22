import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TargetLine } from "./target-line";

const dateLabel = (iso: string) => iso.slice(5);

const points = [
  { at: "2026-10-05", rate: 0.97 },
  { at: "2026-10-12", rate: 0.96 },
  { at: "2026-10-19", rate: 0.91 },
  { at: "2026-10-26", rate: 0.95 },
  { at: "2026-11-02", rate: 0.98 },
];

describe("TargetLine", () => {
  it("labels the target, marks the one week under it and says so in the tooltip", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TargetLine
        label="On time rate"
        points={points}
        target={0.95}
        dateLabel={dateLabel}
        height={220}
        width={760}
      />,
    );
    expect(screen.getByText("Target 95%")).toBeTruthy();
    expect(container.querySelectorAll("[data-under]")).toHaveLength(1);
    expect(container.querySelectorAll('path[data-series="rate"]')).toHaveLength(1);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("figure", { name: "On time rate" }));
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("10-19");
    expect(live?.textContent).toContain("91%");
    expect(live?.textContent).toContain("▼ Under target");
  });

  it("draws a plain line without a target", () => {
    const { container } = render(
      <TargetLine
        label="On time rate"
        points={points}
        target={null}
        dateLabel={dateLabel}
        height={220}
        width={760}
      />,
    );
    expect(screen.queryByText(/Target/)).toBeNull();
    expect(container.querySelectorAll("[data-under]")).toHaveLength(0);
    expect(container.querySelectorAll('path[data-series="rate"]')).toHaveLength(1);
  });

  it("breaks the line at a week with no data", () => {
    const { container } = render(
      <TargetLine
        label="On time rate"
        points={[
          { at: "2026-10-05", rate: 0.97 },
          { at: "2026-10-12", rate: 0.96 },
          { at: "2026-10-19", rate: null },
          { at: "2026-10-26", rate: 0.95 },
          { at: "2026-11-02", rate: 0.98 },
        ]}
        target={0.95}
        dateLabel={dateLabel}
        height={220}
        width={760}
      />,
    );
    expect(container.querySelectorAll('path[data-series="rate"]')).toHaveLength(2);
  });

  it("shows the empty caption, draws no line and takes no tab stop when every rate is null", () => {
    const { container } = render(
      <TargetLine
        label="On time rate"
        points={[
          { at: "2026-10-05", rate: null },
          { at: "2026-10-12", rate: null },
        ]}
        target={0.95}
        dateLabel={dateLabel}
        height={220}
        width={760}
        empty="No deliveries in these 30 days"
      />,
    );
    expect(screen.getByText("No deliveries in these 30 days")).toBeTruthy();
    expect(screen.getByText("On time rate", { selector: "caption" })).toBeTruthy();
    expect(container.querySelectorAll('path[data-series="rate"]')).toHaveLength(0);
    expect(screen.getByRole("figure").hasAttribute("tabindex")).toBe(false);
  });
});
