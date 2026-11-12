import { describe, expect, it } from "vitest";

import { shipRefusal } from "./ship-refusal";

describe("shipRefusal", () => {
  it("names an order that's already shipped, and marks the list stale", () => {
    expect(shipRefusal({ code: "order_already_shipped", detail: "x" }, 1042)).toEqual({ message: "#1042 is already shipped.", stale: true });
  });

  it("names an order that isn't ready any more, and marks the list stale", () => {
    expect(shipRefusal({ code: "order_not_ready", detail: "x" }, 1042)).toEqual({ message: "#1042 isn't ready to ship any more.", stale: true });
  });

  it("says no courier service is set up", () => {
    expect(shipRefusal({ code: "courier_account_missing", detail: "x" }, 1042)).toEqual({
      message: "No courier service is set up for labels.",
      stale: false,
    });
  });

  it("says a label is already being bought", () => {
    expect(shipRefusal({ code: "label_in_progress", detail: "x" }, 1042)).toEqual({
      message: "A label for #1042 is already being bought. Wait a moment, then check the order.",
      stale: false,
    });
  });

  it("falls back to erp-api's detail for any other code", () => {
    expect(shipRefusal({ code: "other", detail: "Nope" }, 1042)).toEqual({ message: "Nope", stale: false });
    expect(shipRefusal({ code: null, detail: "Nope" }, 1042)).toEqual({ message: "Nope", stale: false });
  });
});
