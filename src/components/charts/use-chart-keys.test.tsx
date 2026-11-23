import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useChartKeys } from "./use-chart-keys";

function Probe({ count, onMove }: { count: number; onMove: (i: number | null) => void }) {
  const { index, bind } = useChartKeys(count, onMove);
  return (
    <div role="group" aria-label="chart" {...bind}>
      <span data-testid="index">{index === null ? "none" : index}</span>
    </div>
  );
}

function setup(count = 3) {
  const onMove = vi.fn();
  const user = userEvent.setup();
  render(<Probe count={count} onMove={onMove} />);
  screen.getByRole("group").focus();
  return { user, onMove, shown: () => screen.getByTestId("index").textContent };
}

describe("useChartKeys", () => {
  it("steps right from nothing to the first point and stops at the last", async () => {
    const { user, shown } = setup();
    await user.keyboard("{ArrowRight}");
    expect(shown()).toBe("0");
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(shown()).toBe("2");
  });

  it("starts from the last point on ArrowLeft", async () => {
    const { user, shown } = setup();
    await user.keyboard("{ArrowLeft}");
    expect(shown()).toBe("2");
  });

  it("jumps with End and Home and clears with Escape", async () => {
    const { user, onMove, shown } = setup();
    await user.keyboard("{End}");
    expect(shown()).toBe("2");
    await user.keyboard("{Home}");
    expect(shown()).toBe("0");
    await user.keyboard("{Escape}");
    expect(shown()).toBe("none");
    expect(onMove).toHaveBeenLastCalledWith(null);
  });

  it("clears when focus leaves", async () => {
    const { user, shown } = setup();
    await user.keyboard("{ArrowRight}");
    expect(shown()).toBe("0");
    await user.tab();
    expect(shown()).toBe("none");
  });

  it("does nothing without points", async () => {
    const { user, onMove, shown } = setup(0);
    await user.keyboard("{ArrowRight}{End}");
    expect(shown()).toBe("none");
    expect(onMove).not.toHaveBeenCalled();
  });
});
