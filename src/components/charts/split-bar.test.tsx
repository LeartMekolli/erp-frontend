import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SplitBar } from "./split-bar";
import { CHART } from "./tokens";

const parts = [
  { key: "printed", label: "Printed parts", value: 60, display: "6,000" },
  { key: "cast", label: "Cast metal parts", value: 34, display: "3,400" },
  { key: "assembly", label: "Assemblies", value: 6, display: "600" },
];

describe("SplitBar", () => {
  it("prints a share inside only the parts wide enough, and lists every part", () => {
    const { container } = render(<SplitBar label="Where revenue comes from" parts={parts} width={400} />);
    const bar = (key: string) => container.querySelector(`[data-part="${key}"]`);
    expect(bar("printed")?.textContent).toBe("60%");
    expect(bar("cast")?.textContent).toBe("34%");
    expect(bar("assembly")?.textContent).toBe("");

    const legend = within(screen.getByRole("list"));
    expect(legend.getAllByRole("listitem")).toHaveLength(3);
    expect(legend.getByText("Assemblies")).toBeTruthy();
    expect(legend.getByText("600")).toBeTruthy();
  });

  it("colours the parts in sequence and a part keyed none gray", () => {
    const { container } = render(
      <SplitBar
        label="Where revenue comes from"
        parts={[...parts.slice(0, 2), { key: "none", label: "No category", value: 10, display: "1,000" }]}
        width={400}
      />,
    );
    const fill = (key: string) => (container.querySelector(`[data-part="${key}"]`) as HTMLElement).style.backgroundColor;
    const probe = document.createElement("div");
    const normal = (colour: string) => {
      probe.style.backgroundColor = colour;
      return probe.style.backgroundColor;
    };
    expect(fill("printed")).toBe(normal(CHART.split[0]));
    expect(fill("cast")).toBe(normal(CHART.split[1]));
    expect(fill("none")).toBe(normal(CHART.gray));
  });

  it("draws an empty track and no legend items for no parts", () => {
    const { container } = render(<SplitBar label="Where revenue comes from" parts={[]} width={400} />);
    expect(container.querySelectorAll("[data-part]")).toHaveLength(0);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
