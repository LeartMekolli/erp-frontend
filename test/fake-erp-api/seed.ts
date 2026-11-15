/**
 * The fake erp-api's data, mirroring erp-api's seed (`src/cli/seed*.ts`):
 * workspace `demo`, its owner as staff, the owner of each seeded workshop,
 * and a demo customer person. Every account shares FAKE_PASSWORD.
 */

import type { MeResponse, PartnerRole } from "../../src/lib/api/schema-types";

export const FAKE_API_URL = "http://localhost:4010";
export const WORKSPACE = "demo";
export const TENANT_ID = "8d3a6a1e-4f5b-4c2d-9a7e-1b2c3d4e5f60";
/** The demo workspace as erp-api's seed creates it (`src/cli/seed.ts:37-44`). */
export const WORKSPACE_INFO = { id: TENANT_ID, slug: WORKSPACE, name: "Demo", default_currency: "EUR", timezone: "UTC", labels_available: true };
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
  /** A partner person's role at each of their workshops; owner when left out. */
  partnerRole?: PartnerRole;
}

export const STAFF: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01",
  email: "owner@demo.example.test",
  name: "Dana",
  kind: "staff",
  permissions: [
    "order.read",
    "order.write",
    "order.ship",
    "customer.read",
    "partner.read",
    "payment.read",
    "payment.write",
    "payment.refund",
    "ai.use",
    "report.read",
    "workflow.read",
    "workflow.move",
    "partner.assign",
    "file.read",
    "file.write",
    "settings.read",
  ],
  organisations: [],
};

/** Not in erp-api's seed: staff who may only read orders. */
export const CLERK: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c07",
  email: "clerk@demo.example.test",
  name: "Kai",
  kind: "staff",
  permissions: ["order.read"],
  organisations: [],
};

/** Reads work lists but can't move pieces. */
export const WORKFLOW_READER: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c20",
  email: "viewer@demo.example.test",
  name: "Sam",
  kind: "staff",
  permissions: ["order.read", "workflow.read"],
  organisations: [],
};

/** Can change orders but can't refund them. */
export const ORDER_WRITER: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c21",
  email: "writer@demo.example.test",
  name: "Noor",
  kind: "staff",
  permissions: ["order.read", "order.write"],
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

/** Not in erp-api's seed: Northcast's admin, who sees earnings but can't set up payouts. */
export const NORTHCAST_ADMIN: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c30",
  email: "admin@northcast.example.test",
  name: "Ines",
  kind: "partner",
  permissions: [],
  organisations: [NORTHCAST_ID],
  partnerRole: "admin",
};

/** Not in erp-api's seed: a Northcast member, who works on jobs but doesn't see earnings. */
export const NORTHCAST_MEMBER: FakeUser = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c31",
  email: "member@northcast.example.test",
  name: "Milo",
  kind: "partner",
  permissions: [],
  organisations: [NORTHCAST_ID],
  partnerRole: "member",
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

export const USERS: readonly FakeUser[] = [STAFF, CLERK, WORKFLOW_READER, ORDER_WRITER, PARTNER, LAYERLINE_OWNER, NORTHCAST_ADMIN, NORTHCAST_MEMBER, PARTNER_TWO_SHOPS, CUSTOMER, NO_ACCESS];

export const PARTNER_NAMES: Record<string, string> = {
  [NORTHCAST_ID]: "Northcast Foundry",
  [LAYERLINE_ID]: "Layerline Prints",
};

/** Partners and customers by id, as an invitation names what it joins. */
export const ORGANISATION_NAMES: Record<string, string> = { ...PARTNER_NAMES, [LUNA_ID]: "Luna" };

// Email-link tokens have erp-api's shape: `<tenantId>.<43 base64url characters>`.
const token = (fill: string) => `${TENANT_ID}.${fill.repeat(43).slice(0, 43)}`;

export const STAFF_INVITE_TOKEN = token("s");
/** A staff invitation to an email that already has an account: accepting answers 409. */
export const STAFF_EXISTING_INVITE_TOKEN = token("a");
export const PARTNER_INVITE_TOKEN = token("p");
/** Invites Layerline's owner to Northcast too: they accept with the token only. */
export const PARTNER_EXISTING_INVITE_TOKEN = token("e");
export const CUSTOMER_INVITE_TOKEN = token("c");
export const EXPIRED_INVITE_TOKEN = token("x");
export const RESET_TOKEN = token("r");
/** Already spent: an accepted invitation, and a used reset link. */
export const USED_TOKEN = token("u");

export interface FakeInvitation {
  kind: "staff" | "partner" | "customer";
  email: string;
  /** The staff role's name, or the partner or customer role. */
  role: string;
  /** The partner or customer it joins; none for staff. */
  organisationId?: string;
  expired?: boolean;
}

/** Who each invitation is for, and what it joins. */
export const INVITATIONS: Record<string, FakeInvitation> = {
  [STAFF_INVITE_TOKEN]: { kind: "staff", email: "invited@demo.example.test", role: "Sales" },
  [STAFF_EXISTING_INVITE_TOKEN]: { kind: "staff", email: STAFF.email, role: "Sales" },
  [PARTNER_INVITE_TOKEN]: { kind: "partner", email: "invited@northcast.example.test", role: "member", organisationId: NORTHCAST_ID },
  [PARTNER_EXISTING_INVITE_TOKEN]: { kind: "partner", email: LAYERLINE_OWNER.email, role: "admin", organisationId: NORTHCAST_ID },
  [CUSTOMER_INVITE_TOKEN]: { kind: "customer", email: "buyer@luna.example.test", role: "member", organisationId: LUNA_ID },
  [EXPIRED_INVITE_TOKEN]: { kind: "staff", email: "late@demo.example.test", role: "Sales", expired: true },
  [USED_TOKEN]: { kind: "staff", email: "joined@demo.example.test", role: "Sales" },
};
