import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LUNA_ID, MIRA_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { renderHookAs } from "../../../test/render";

import { useCustomerProducts, useDeliverySpeeds } from "./queries";

describe("new order queries", () => {
  it("lists Luna's products by name", async () => {
    const { result } = renderHookAs(STAFF, () => useCustomerProducts(LUNA_ID));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The draft Desk tidy is hidden; Luna's own logo stand is shown.
    expect(result.current.data?.map((product) => product.name)).toEqual(["Cast ring", "Gift set", "Luna logo stand", "Nameplate"]);
  });

  it("offers Mira only Standard", async () => {
    const { result } = renderHookAs(STAFF, () => useDeliverySpeeds(MIRA_ID));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((speed) => speed.name)).toEqual(["Standard"]);
  });
});
