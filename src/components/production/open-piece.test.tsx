import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OpenPieceProvider, useOpenPiece } from "./open-piece";

describe("useOpenPiece", () => {
  it("opens a piece, then closes it", () => {
    const { result } = renderHook(useOpenPiece, { wrapper: OpenPieceProvider });
    expect(result.current.id).toBeNull();
    act(() => result.current.open("p1"));
    expect(result.current.id).toBe("p1");
    act(() => result.current.close());
    expect(result.current.id).toBeNull();
  });

  it("refuses to work outside a page that shows the panel", () => {
    expect(() => renderHook(useOpenPiece)).toThrow(/OpenPieceProvider/);
  });
});
