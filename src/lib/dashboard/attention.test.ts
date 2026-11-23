import { describe, expect, it } from "vitest";

import type { AttentionGroup } from "@/lib/api/schema-types";

import { ATTENTION, ATTENTION_KINDS, attentionRows } from "./attention";

const group = (kind: AttentionGroup["kind"], total: number): AttentionGroup => ({ kind, total, items: [] });

describe("ATTENTION", () => {
  it("has words, a dot and a link for every kind, in erp-api's order", () => {
    expect(Object.keys(ATTENTION)).toEqual([...ATTENTION_KINDS]);
    for (const kind of ATTENTION_KINDS) {
      expect(ATTENTION[kind].words).not.toBe("");
      expect(ATTENTION[kind].href).toMatch(/^\//);
    }
  });

  it("sends orders at risk to the Orders list", () => {
    expect(ATTENTION.order_at_risk).toEqual({ words: "Orders at risk", dot: "late", href: "/orders" });
  });
});

describe("attentionRows", () => {
  it("keeps the kinds with something in them, in erp-api's order", () => {
    const rows = attentionRows([group("defect_spike", 1), group("awaiting_payment", 0), group("order_at_risk", 2)]);
    expect(rows.map((row) => row.kind)).toEqual(["order_at_risk", "defect_spike"]);
  });
});
