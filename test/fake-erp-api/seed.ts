/**
 * The fake erp-api's data, mirroring erp-api's seed (`src/cli/seed*.ts`):
 * workspace `demo`, its owner as staff, the owner of each seeded workshop,
 * and a demo customer person. Every account shares FAKE_PASSWORD.
 */

import type { MeResponse } from "../../src/lib/api/schema-types";

export const FAKE_API_URL = "http://localhost:4010";
export const WORKSPACE = "demo";
export const TENANT_ID = "8d3a6a1e-4f5b-4c2d-9a7e-1b2c3d4e5f60";
/** The demo workspace as erp-api's seed creates it (`src/cli/seed.ts:37-44`). */
export const WORKSPACE_INFO = { id: TENANT_ID, slug: WORKSPACE, name: "Demo", default_currency: "EUR", timezone: "UTC" };
export const FAKE_PASSWORD = "fake-password-1";

export const NORTHCAST_ID = "2f1c5d7e-0a9b-4e3c-8d2f-6a5b4c3d2e10";
export const LAYERLINE_ID = "7b6a5c4d-3e2f-4a1b-9c8d-0e1f2a3b4c20";
export const LUNA_ID = "c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e30";

export interface FakeUser {
  id: string;
  email: string;
  name: string;
  kind: "staff" | "partner" | "customer";
  permissions: MeResponse["permissions"];
  /** Partner ids for a partner person, the customer id for a customer person. */
  organisations: string[];
}

export const STAFF: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01",
  email: "owner@demo.example.test",
  name: "Dana",
  kind: "staff",
  permissions: ["order.read", "order.write", "customer.read", "partner.read"],
  organisations: [],
};

export const PARTNER: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02",
  email: "owner@northcast.example.test",
  name: "Nora",
  kind: "partner",
  permissions: [],
  organisations: [NORTHCAST_ID],
};

export const LAYERLINE_OWNER: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c03",
  email: "owner@layerline.example.test",
  name: "Leo",
  kind: "partner",
  permissions: [],
  organisations: [LAYERLINE_ID],
};

/** Not in erp-api's seed: a partner person acting for both workshops. */
export const PARTNER_TWO_SHOPS: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c04",
  email: "both@partners.example.test",
  name: "Sam",
  kind: "partner",
  permissions: [],
  organisations: [NORTHCAST_ID, LAYERLINE_ID],
};

export const CUSTOMER: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c05",
  email: "anna@luna.example.test",
  name: "Anna",
  kind: "customer",
  permissions: [],
  organisations: [LUNA_ID],
};

/** Not in erp-api's seed: a staff user with no roles yet. */
export const NO_ACCESS: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c06",
  email: "new@demo.example.test",
  name: "Noa",
  kind: "staff",
  permissions: [],
  organisations: [],
};

export const USERS: readonly FakeUser[] = [STAFF, PARTNER, LAYERLINE_OWNER, PARTNER_TWO_SHOPS, CUSTOMER, NO_ACCESS];

export const PARTNER_NAMES: Record<string, string> = {
  [NORTHCAST_ID]: "Northcast Foundry",
  [LAYERLINE_ID]: "Layerline Prints",
};

// Email-link tokens have erp-api's shape: `<tenantId>.<43 base64url characters>`.
const token = (fill: string) => `${TENANT_ID}.${fill.repeat(43).slice(0, 43)}`;

export const STAFF_INVITE_TOKEN = token("s");
export const PARTNER_INVITE_TOKEN = token("p");
export const RESET_TOKEN = token("r");
export const USED_TOKEN = token("u");

/** Who each invitation is for, and what it joins. */
export const INVITATIONS = {
  [STAFF_INVITE_TOKEN]: { kind: "staff", email: "invited@demo.example.test" },
  [PARTNER_INVITE_TOKEN]: { kind: "partner", email: "invited@northcast.example.test", partnerId: NORTHCAST_ID },
} as const;
