import { describe, expect, it } from "vitest";

import { customersQuery, DEFAULT_CUSTOMERS_VIEW, filtersSet } from "./view";

describe("the Customers list's query", () => {
  it("asks for active customers by default", () => {
    expect(customersQuery(DEFAULT_CUSTOMERS_VIEW)).toEqual({ status: "active" });
  });

  it("sends no status for All", () => {
    expect(customersQuery({ ...DEFAULT_CUSTOMERS_VIEW, status: "all" })).toEqual({});
  });

  it("trims the search and leaves out a blank one", () => {
    expect(customersQuery({ ...DEFAULT_CUSTOMERS_VIEW, q: "  luna " })).toEqual({ status: "active", q: "luna" });
    expect(customersQuery({ ...DEFAULT_CUSTOMERS_VIEW, q: "   " })).toEqual({ status: "active" });
    expect(customersQuery({ ...DEFAULT_CUSTOMERS_VIEW, q: "" })).toEqual({ status: "active" });
  });

  it("sends the group, none included, and the band", () => {
    expect(customersQuery({ ...DEFAULT_CUSTOMERS_VIEW, group: "none", band: "gold", status: "disabled" })).toEqual({
      status: "disabled",
      customer_group: "none",
      band: "gold",
    });
  });

  it("knows when anything but the default is picked", () => {
    expect(filtersSet(DEFAULT_CUSTOMERS_VIEW)).toBe(false);
    expect(filtersSet({ ...DEFAULT_CUSTOMERS_VIEW, q: "  " })).toBe(false);
    expect(filtersSet({ ...DEFAULT_CUSTOMERS_VIEW, q: "mira" })).toBe(true);
    expect(filtersSet({ ...DEFAULT_CUSTOMERS_VIEW, status: "all" })).toBe(true);
    expect(filtersSet({ ...DEFAULT_CUSTOMERS_VIEW, group: "none" })).toBe(true);
    expect(filtersSet({ ...DEFAULT_CUSTOMERS_VIEW, band: "standard" })).toBe(true);
  });
});
