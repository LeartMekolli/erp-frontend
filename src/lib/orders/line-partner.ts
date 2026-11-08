import type { LinePartner } from "@/lib/api/schema-types";

export type PartnerStatus =
  | { kind: "in_house" }
  | { kind: "offered"; name: string; expiresAt: string | null }
  | { kind: "offer_expired"; name: string }
  | { kind: "accepted"; name: string };

/**
 * Who has a line. erp-api keeps an offer as `offered` until its expiry run
 * lets it go, so a deadline already past reads as expired here.
 */
export function partnerStatus(partner: LinePartner | null, now: number): PartnerStatus {
  if (!partner) return { kind: "in_house" };
  if (partner.status === "accepted") return { kind: "accepted", name: partner.name };
  if (partner.expires_at && Date.parse(partner.expires_at) <= now) return { kind: "offer_expired", name: partner.name };
  return { kind: "offered", name: partner.name, expiresAt: partner.expires_at };
}
