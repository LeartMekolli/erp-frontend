import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobStatus } from "./job-status";

const LABELS = {
  pending: "Queued",
  working: "Building",
  done: "Ready",
  failed: "Failed",
  expired: "Expired",
};

describe("JobStatus", () => {
  it("shows a dot and the word for the state, announced", () => {
    render(<JobStatus state="working" labels={LABELS} slow={false} offline={false} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Building");
    expect(status.querySelector("[data-dot='working']")).toHaveAttribute("aria-hidden", "true");
  });

  it("marks failed and expired in the late colour", () => {
    const { rerender } = render(<JobStatus state="failed" labels={LABELS} slow={false} offline={false} />);
    expect(screen.getByRole("status").querySelector("[data-dot]")).toHaveClass("bg-late");
    rerender(<JobStatus state="expired" labels={LABELS} slow={false} offline={false} />);
    expect(screen.getByRole("status").querySelector("[data-dot]")).toHaveClass("bg-late");
  });

  it("says when it is slow", () => {
    render(<JobStatus state="pending" labels={LABELS} slow offline={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "This is taking longer than usual. You can leave this page; it carries on.",
    );
  });

  it("says when it is offline", () => {
    render(<JobStatus state="pending" labels={LABELS} slow={false} offline />);
    expect(screen.getByRole("status")).toHaveTextContent("You're offline. This will update when you're back.");
  });
});
