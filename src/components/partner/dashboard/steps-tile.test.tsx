import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PartnerSummary } from "@/lib/api/schema-types";

import { StepsTile } from "./steps-tile";

const summary = (steps: PartnerSummary["steps"]): PartnerSummary => ({
  range: { from: "2026-10-26", to: "2026-11-24", previous_from: "2026-09-26", previous_to: "2026-10-25", bucket: "day" },
  jobs_finished: 14,
  previous_jobs_finished: 11,
  steps,
});

const STEPS: PartnerSummary["steps"] = [
  { key: "print_pattern", name: "Print pattern", on_track: 3, late: 0 },
  { key: "casting", name: "Casting", on_track: 7, late: 2 },
  { key: "polishing", name: "Polishing", on_track: 2, late: 1 },
];

describe("StepsTile", () => {
  it("has a column per step with every piece there, and names the late ones in words", () => {
    render(<StepsTile summary={summary(STEPS)} width={480} />);
    const tile = screen.getByRole("region", { name: "Pieces at your steps now" });
    expect(tile).toHaveTextContent("live");
    const rows = within(tile).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual(["Print pattern3", "Casting9", "Polishing3"]);
    expect(within(tile).getByText("Late")).toHaveClass("text-late-ink");
    expect(tile).toHaveTextContent("Casting 2 · Polishing 1");
  });

  it("names nothing late when no piece is", () => {
    render(<StepsTile summary={summary([{ key: "casting", name: "Casting", on_track: 4, late: 0 }])} width={480} />);
    expect(screen.queryByText("Late")).toBeNull();
  });

  it("says so when no piece is at the workshop's steps", () => {
    render(<StepsTile summary={summary([])} width={480} />);
    expect(screen.getByText("No pieces at your steps right now.")).toBeInTheDocument();
  });

  it("waits for the summary", () => {
    render(<StepsTile summary={undefined} width={480} />);
    expect(within(screen.getByRole("region", { name: "Pieces at your steps now" })).getByRole("status")).toBeInTheDocument();
  });
});
