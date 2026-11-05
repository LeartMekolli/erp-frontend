import { describe, expect, it } from "vitest";

import type { MeResponse } from "@/lib/api/schema-types";

import { STAFF } from "../../../../test/fake-erp-api/seed";
import { createFakeState } from "../../../../test/fake-erp-api/state";

import { subjectHref } from "./subject-href";

const everything = createFakeState().me({
  ...STAFF,
  permissions: ["order.read", "customer.read", "partner.read", "workflow.read", "settings.read", "catalog.read", "payment.read"],
});
const ordersOnly: MeResponse = { ...everything, permissions: ["order.read"] };

describe("subjectHref", () => {
  it.each([
    ["order", "/orders/x"],
    ["customer", "/customers/x"],
    ["customer_invitation", "/customers"],
    ["partner", "/partners/x"],
    ["partner_invitation", "/partners"],
    ["payout", "/partners"],
    ["job_assignment", "/production"],
    ["user", "/settings"],
    ["invitation", "/settings"],
    ["material", "/catalog"],
    ["credit_campaign", "/payments"],
  ])("sends a %s notification to %s", (type, href) => {
    expect(subjectHref({ type, id: "x" }, everything)).toBe(href);
  });

  it.each(["tenant", "file_version", "something_new"])("has nowhere to send a %s notification", (type) => {
    expect(subjectHref({ type, id: "x" }, everything)).toBeNull();
  });

  it("has nowhere to send a notification about a section the person can't open", () => {
    expect(subjectHref({ type: "order", id: "x" }, ordersOnly)).toBe("/orders/x");
    expect(subjectHref({ type: "partner", id: "x" }, ordersOnly)).toBeNull();
  });
});
