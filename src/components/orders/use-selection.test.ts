import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSelection } from "./use-selection";

describe("useSelection", () => {
  it("toggles, selects all and clears", () => {
    const { result } = renderHook(() => useSelection("tab=all"));
    act(() => result.current.toggle("a"));
    expect([...result.current.ids]).toEqual(["a"]);
    act(() => result.current.setAll(["a", "b", "c"], true));
    expect([...result.current.ids].sort()).toEqual(["a", "b", "c"]);
    act(() => result.current.setAll(["b", "c"], false));
    expect([...result.current.ids]).toEqual(["a"]);
    act(() => result.current.toggle("a"));
    expect(result.current.ids.size).toBe(0);
    act(() => result.current.setAll(["a", "b"], true));
    act(() => result.current.clear());
    expect(result.current.ids.size).toBe(0);
  });

  it("clears on a view change, survives a refetch", () => {
    const { result, rerender } = renderHook(({ view }) => useSelection(view), { initialProps: { view: "tab=all" } });
    act(() => result.current.setAll(["a", "b"], true));

    // A refetch renders again with the same view.
    rerender({ view: "tab=all" });
    expect(result.current.ids.size).toBe(2);

    rerender({ view: "tab=ready" });
    expect(result.current.ids.size).toBe(0);
  });
});
