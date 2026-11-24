import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CHOICE, type RangeChoice } from "@/lib/dashboard/range";

import { RangePicker } from "./range-picker";

const onChange = vi.fn<(next: RangeChoice) => void>();
beforeEach(() => onChange.mockReset());

const renderPicker = (choice: RangeChoice = DEFAULT_CHOICE) => render(<RangePicker choice={choice} onChange={onChange} />);

/** Opens Custom… and fills both dates. */
async function customRange(from: string, to: string) {
  await userEvent.click(screen.getByRole("button", { name: "Custom…" }));
  fireEvent.change(await screen.findByLabelText("From"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
}

describe("RangePicker", () => {
  it("shows the last 30 days as picked by default", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "This quarter" })).toHaveAttribute("aria-pressed", "false");
  });

  it("picks This quarter", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "This quarter" }));
    expect(onChange).toHaveBeenCalledWith({ preset: "quarter" });
  });

  it("shows the range it's given as picked, and picks the default back", async () => {
    renderPicker({ preset: "7d" });
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(onChange).toHaveBeenCalledWith({ preset: "30d" });
  });

  it("refuses an end before the start under the fields, and changes nothing", async () => {
    renderPicker();
    await customRange("2026-11-02", "2026-11-01");
    expect(await screen.findByText("The end is before the start.")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("To")).toHaveAccessibleDescription("The end is before the start.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a range longer than 366 days", async () => {
    renderPicker();
    await customRange("2025-01-01", "2026-01-02");
    expect(await screen.findByText("Pick at most 366 days.")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses Apply with a date left empty", async () => {
    renderPicker();
    await customRange("2026-11-02", "");
    expect(await screen.findByText("Pick a valid date.")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picks a valid custom range and closes", async () => {
    renderPicker();
    await customRange("2026-10-28", "2026-11-03");
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-28", to: "2026-11-03" });
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });

  it("shows a custom range in words, picked, and opens with its dates", async () => {
    renderPicker({ from: "2026-10-28", to: "2026-11-03" });
    const segment = screen.getByRole("button", { name: "28 Oct – 3 Nov" });
    expect(segment).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(segment);
    expect(await screen.findByLabelText("From")).toHaveValue("2026-10-28");
    expect(screen.getByLabelText("To")).toHaveValue("2026-11-03");
  });
});
