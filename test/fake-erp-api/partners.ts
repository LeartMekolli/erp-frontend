/**
 * The fake erp-api's staff partner routes (erp-api `src/modules/partners/partners.controller.ts`):
 * the two seeded workshops, read-only. A workshop's payout account and whether it is suspended
 * live in the stores that already own them, so they are read through the functions given.
 */

import type { PartnerStatus, PayoutAccountState, StaffPartner } from "../../src/lib/api/schema-types";

import { page } from "./earnings";
import type { Answer, Page } from "./orders";
import { LAYERLINE_ID, NORTHCAST_ID, PARTNER_NAMES } from "./seed";

const NO_SCORE: StaffPartner["score"] = {
  overall: null,
  parts: { quality: null, scrap: null, reliability: null, on_time: null, rating: null, claims: null },
  finished_jobs: 0,
};

/** Northcast then Layerline, as erp-api's seed creates them. */
const IDS = [NORTHCAST_ID, LAYERLINE_ID];

export function createPartnersStore(
  accountOf: (id: string) => PayoutAccountState,
  statusOf: (id: string) => PartnerStatus,
  submittedAtOf: (id: string) => string | null,
) {
  const view = (id: string): StaffPartner => {
    const status = statusOf(id);
    return {
      id,
      name: PARTNER_NAMES[id]!,
      display_name: PARTNER_NAMES[id]!,
      status,
      accepts_direct_orders: false,
      agreement: null,
      member_count: 1,
      submitted_at: submittedAtOf(id),
      score: structuredClone(NO_SCORE),
      payout_account: accountOf(id),
      created_at: "2026-01-05T09:00:00.000Z",
    };
  };

  return {
    /** `GET /partners`. */
    list(params: URLSearchParams): Answer<Page<StaffPartner>> {
      const answer = page(IDS, params);
      return answer.ok ? { ok: true, body: { data: answer.body.data.map(view), next_cursor: answer.body.next_cursor } } : answer;
    },

    /** `GET /partners/{id}`. */
    get(id: string): Answer<StaffPartner> {
      return IDS.includes(id) ? { ok: true, body: view(id) } : { ok: false, status: 404, detail: "Partner not found" };
    },
  };
}

export type PartnersStore = ReturnType<typeof createPartnersStore>;
