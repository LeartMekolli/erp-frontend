import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HBars } from "./hbars";

describe("HBars", () => {
  it("lists each name and figure as a row, in the given order", () => {
    render(
      <HBars
        label="Top customers"
        data={[
          { key: "a", label: "Alpha Studio", value: 30, display: "EUR 30" },
          { key: "b", label: "Beta Works", value: 20, display: "EUR 20" },
          { key: "c", label: "Gamma Atelier", value: 0, display: "EUR 0" },
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Top customers" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Alpha StudioEUR 30",
      "Beta WorksEUR 20",
      "Gamma AtelierEUR 0",
    ]);
    expect(items[0].querySelector("[data-bar]")).not.toBeNull();
    expect(items[2].querySelector("[data-bar]")).toBeNull();
  });

  it("renders only the labelled list when there is no data", () => {
    render(<HBars label="Defects by kind" data={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
