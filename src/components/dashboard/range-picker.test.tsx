import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RangePicker } from "./range-picker";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
});

/** Opens Custom… and fills both dates. */
async function customRange(from: string, to: string) {
  await userEvent.click(screen.getByRole("button", { name: "Custom…" }));
  fireEvent.change(await screen.findByLabelText("From"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
}

describe("RangePicker", () => {
  it("shows the last 30 days as picked when the address names no range", () => {
    render(<RangePicker />);
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "This quarter" })).toHaveAttribute("aria-pressed", "false");
  });

  it("puts This quarter in the address", async () => {
    render(<RangePicker />);
    await userEvent.click(screen.getByRole("button", { name: "This quarter" }));
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard?range=quarter", { scroll: false });
  });

  it("leaves the default out of the address", async () => {
    navigation.search = "range=7d";
    render(<RangePicker />);
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard", { scroll: false });
  });

  it("refuses an end before the start under the fields, and leaves the address alone", async () => {
    render(<RangePicker />);
    await customRange("2026-11-02", "2026-11-01");
    expect(await screen.findByText("The end is before the start.")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("To")).toHaveAccessibleDescription("The end is before the start.");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("refuses a range longer than 366 days", async () => {
    render(<RangePicker />);
    await customRange("2025-01-01", "2026-01-02");
    expect(await screen.findByText("Pick at most 366 days.")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("refuses Apply with a date left empty", async () => {
    render(<RangePicker />);
    await customRange("2026-11-02", "");
    expect(await screen.findByText("Pick a valid date.")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("puts a valid custom range in the address and closes", async () => {
    render(<RangePicker />);
    await customRange("2026-10-28", "2026-11-03");
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard?from=2026-10-28&to=2026-11-03", { scroll: false });
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });

  it("shows a custom range in words, picked, and opens with its dates", async () => {
    navigation.search = "from=2026-10-28&to=2026-11-03";
    render(<RangePicker />);
    const segment = screen.getByRole("button", { name: "28 Oct – 3 Nov" });
    expect(segment).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(segment);
    expect(await screen.findByLabelText("From")).toHaveValue("2026-10-28");
    expect(screen.getByLabelText("To")).toHaveValue("2026-11-03");
  });
});
