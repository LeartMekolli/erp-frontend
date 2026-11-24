import { act, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { leaveArrivalNote, resetArrivalNotes, useArrivalNote, type ArrivalNote } from "./arrival-note";

afterEach(() => resetArrivalNotes());

const describeNote = (note: ArrivalNote | null) => (note === null ? "none" : (note.partnerTab ?? (note.placed ? "placed" : (note.onboarding ?? "empty"))));

/** Keeps what arrives in its own state, as a page does, and records every committed text. */
function Probe({ path, seen, onArrive }: { path: string; seen?: string[]; onArrive?: () => void }) {
  const [note, setNote] = useState<ArrivalNote | null>(null);
  useArrivalNote(path, (arrived) => {
    onArrive?.();
    setNote(arrived);
  });
  const text = describeNote(note);
  // Committed renders only: a render React throws away to apply state isn't painted.
  useEffect(() => {
    seen?.push(text);
  });
  return <p>{text}</p>;
}

describe("useArrivalNote", () => {
  it("a note left before the page mounts shows on its first render", () => {
    leaveArrivalNote("/orders/a", { placed: true });
    const seen: string[] = [];
    render(<Probe path="/orders/a" seen={seen} />);
    expect(screen.getByText("placed")).toBeInTheDocument();
    // The note is applied while rendering, so no render ever showed the default.
    expect(seen).not.toContain("none");
  });

  it("a note left while the page is open arrives", () => {
    render(<Probe path="/partners/p" />);
    expect(screen.getByText("none")).toBeInTheDocument();
    act(() => leaveArrivalNote("/partners/p", { partnerTab: "payouts" }));
    expect(screen.getByText("payouts")).toBeInTheDocument();
  });

  it("a note is used once", () => {
    leaveArrivalNote("/orders/a", { placed: true });
    const first = render(<Probe path="/orders/a" />);
    expect(screen.getByText("placed")).toBeInTheDocument();
    first.unmount();
    render(<Probe path="/orders/a" />);
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("another page's note is ignored and kept", () => {
    leaveArrivalNote("/orders/b", { placed: true });
    const other = render(<Probe path="/orders/a" />);
    expect(screen.getByText("none")).toBeInTheDocument();
    other.unmount();
    render(<Probe path="/orders/b" />);
    expect(screen.getByText("placed")).toBeInTheDocument();
  });

  it("a newer note for the same page replaces the older one", () => {
    leaveArrivalNote("/earnings", { onboarding: "expired" });
    leaveArrivalNote("/earnings", { onboarding: "done" });
    render(<Probe path="/earnings" />);
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("each note is handled once under StrictMode", () => {
    leaveArrivalNote("/orders/a", { placed: true });
    let calls = 0;
    render(
      <StrictMode>
        <Probe path="/orders/a" onArrive={() => calls++} />
      </StrictMode>,
    );
    expect(screen.getByText("placed")).toBeInTheDocument();
    // StrictMode may render twice before the first commit; after it, the note is gone.
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(2);
    act(() => leaveArrivalNote("/elsewhere", { placed: true }));
    expect(calls).toBeLessThanOrEqual(2);
  });
});
