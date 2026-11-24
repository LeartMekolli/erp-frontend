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

/** A feed entry about `subject`, with no payout and an ordinary event. */
const entryFor = (subject: { type: string; id: string }, extra: { payout?: { id: string; partner_id: string }; event_key?: string } = {}) => ({
  subject,
  payout: extra.payout ?? null,
  event_key: extra.event_key ?? "order.placed",
});

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
    expect(subjectHref(entryFor({ type, id: "x" }), everything)).toEqual({ href });
  });

  it.each(["tenant", "file_version", "something_new"])("has nowhere to send a %s notification", (type) => {
    expect(subjectHref(entryFor({ type, id: "x" }), everything)).toBeNull();
  });

  it("has nowhere to send a notification about a section the person can't open", () => {
    expect(subjectHref(entryFor({ type: "order", id: "x" }), ordersOnly)).toEqual({ href: "/orders/x" });
    expect(subjectHref(entryFor({ type: "partner", id: "x" }), ordersOnly)).toBeNull();
  });

  it("opens the failed payout's partner on Payouts, with a plain address", () => {
    const entry = entryFor({ type: "payout", id: "pay1" }, { payout: { id: "pay1", partner_id: "p1" }, event_key: "payout.failed" });
    expect(subjectHref(entry, everything)).toEqual({ href: "/partners/p1", note: { partnerTab: "payouts" } });
    expect(subjectHref(entry, ordersOnly)).toBeNull();
  });

  it("opens Partners for the weekly reminder", () => {
    const entry = entryFor({ type: "tenant", id: "t1" }, { event_key: "payouts.reminder" });
    expect(subjectHref(entry, everything)).toEqual({ href: "/partners" });
    expect(subjectHref(entry, ordersOnly)).toBeNull();
  });
});
