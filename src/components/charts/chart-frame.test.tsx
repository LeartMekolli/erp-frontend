import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChartFrame } from "./chart-frame";

const TABLE = {
  caption: "Orders per day",
  columns: ["Day", "Orders"],
  rows: [
    ["Mon", 3],
    ["Tue", 5],
    ["Wed", 0],
  ],
};

describe("ChartFrame", () => {
  it("shows the empty caption and still renders the table", () => {
    render(
      <ChartFrame
        label="Orders"
        height={120}
        width={400}
        empty="No orders in these 30 days"
        table={TABLE}
      >
        {() => <svg />}
      </ChartFrame>,
    );
    expect(screen.getByText("No orders in these 30 days")).toBeTruthy();
    expect(screen.getByText("Orders per day")).toBeTruthy();
  });

  it("has a row per data row plus the header row", () => {
    render(
      <ChartFrame label="Orders" height={120} width={400} table={TABLE}>
        {() => <svg />}
      </ChartFrame>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(TABLE.rows.length + 1);
  });

  it("gives its children the width and height", () => {
    const children = vi.fn(() => <svg />);
    render(
      <ChartFrame label="Orders" height={120} width={400} table={TABLE}>
        {children}
      </ChartFrame>,
    );
    expect(children).toHaveBeenCalledWith({ width: 400, height: 120 });
  });

  it("names the figure with the label", () => {
    render(
      <ChartFrame label="Orders over 30 days" height={120} width={400} table={TABLE}>
        {() => <svg />}
      </ChartFrame>,
    );
    expect(screen.getByRole("figure", { name: "Orders over 30 days" })).toBeTruthy();
  });
});
