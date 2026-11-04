import { describe, expect, it } from "vitest";

import {
  CUSTOMER,
  FAKE_PASSWORD,
  PARTNER,
  PARTNER_INVITE_TOKEN,
  RESET_TOKEN,
  STAFF,
  STAFF_INVITE_TOKEN,
  USED_TOKEN,
  WORKSPACE,
} from "./seed";
import { createFakeState, type SessionTokens } from "./state";

function tokens(result: SessionTokens | { status: number }): SessionTokens {
  if ("status" in result) throw new Error(`expected tokens, got ${result.status}`);
  return result;
}

describe("fake erp-api state", () => {
  it("rotates refresh tokens and revokes the session on reuse", () => {
    const s = createFakeState();
    const first = tokens(s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD));
    const second = tokens(s.refresh(first.refresh_token));
    expect(s.refresh(first.refresh_token)).toEqual({ status: 401 });
    expect(s.refresh(second.refresh_token)).toEqual({ status: 401 });
  });

  it("answers the same 401 for a wrong password, an unknown email and an unknown workspace", () => {
    const s = createFakeState();
    expect(s.login(WORKSPACE, STAFF.email, "wrong-password")).toEqual({ status: 401 });
    expect(s.login(WORKSPACE, "nobody@demo.example.test", FAKE_PASSWORD)).toEqual({ status: 401 });
    expect(s.login("elsewhere", STAFF.email, FAKE_PASSWORD)).toEqual({ status: 401 });
  });

  it("answers 429 on the 11th failed login inside 15 minutes, even with the right password", () => {
    const s = createFakeState();
    for (let i = 0; i < 10; i++) expect(s.login(WORKSPACE, STAFF.email, "wrong")).toEqual({ status: 401 });
    expect(s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD)).toEqual({ status: 429 });
  });

  it("forgets failed logins after 15 minutes", () => {
    let now = 0;
    const s = createFakeState(() => now);
    for (let i = 0; i < 10; i++) s.login(WORKSPACE, STAFF.email, "wrong");
    now += 15 * 60 * 1000;
    expect("access_token" in s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD)).toBe(true);
  });

  it("expires access tokens after 15 minutes", () => {
    let now = 0;
    const s = createFakeState(() => now);
    const t = tokens(s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD));
    expect(s.authenticate(t.access_token)?.email).toBe(STAFF.email);
    now += 15 * 60 * 1000;
    expect(s.authenticate(t.access_token)).toBeNull();
  });

  it("logs out: the refresh token is revoked and the access token denied at once", () => {
    const s = createFakeState();
    const t = tokens(s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD));
    expect(s.logout(t.access_token, t.refresh_token)).toEqual({ status: 204 });
    expect(s.authenticate(t.access_token)).toBeNull();
    expect(s.refresh(t.refresh_token)).toEqual({ status: 401 });
  });

  it("refuses logout without a valid access token", () => {
    const s = createFakeState();
    const t = tokens(s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD));
    expect(s.logout("not-a-token", t.refresh_token)).toEqual({ status: 401 });
  });

  it("refuses a partner token on the staff invitation route, and the reverse", () => {
    const s = createFakeState();
    expect(s.acceptStaffInvitation(PARTNER_INVITE_TOKEN, "Ana", "a-long-password")).toEqual({ status: 400 });
    expect(s.acceptPartnerInvitation(STAFF_INVITE_TOKEN, "Ana", "a-long-password")).toEqual({ status: 400 });
  });

  it("accepts an invitation once", () => {
    const s = createFakeState();
    expect(s.acceptStaffInvitation(STAFF_INVITE_TOKEN, "Ana", "a-long-password")).toEqual({ status: 204 });
    expect(s.acceptStaffInvitation(STAFF_INVITE_TOKEN, "Ana", "a-long-password")).toEqual({ status: 400 });
  });

  it("signs in with the password set by an invitation", () => {
    const s = createFakeState();
    s.acceptPartnerInvitation(PARTNER_INVITE_TOKEN, "Pia", "pia-long-password");
    expect("access_token" in s.login(WORKSPACE, "invited@northcast.example.test", "pia-long-password")).toBe(true);
  });

  it("resets a password once with the reset token", () => {
    const s = createFakeState();
    expect(s.confirmPasswordReset(RESET_TOKEN, "new-long-password")).toEqual({ status: 204 });
    expect("access_token" in s.login(WORKSPACE, STAFF.email, "new-long-password")).toBe(true);
    expect(s.confirmPasswordReset(RESET_TOKEN, "another-password")).toEqual({ status: 400 });
    expect(s.confirmPasswordReset(USED_TOKEN, "another-password")).toEqual({ status: 400 });
  });

  it("describes each kind of user on /me", () => {
    const s = createFakeState();
    const staff = s.authenticate(tokens(s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD)).access_token)!;
    expect(s.me(staff)).toMatchObject({ memberships: [], permissions: expect.arrayContaining(["order.read"]) });
    const customer = s.authenticate(tokens(s.login(WORKSPACE, CUSTOMER.email, FAKE_PASSWORD)).access_token)!;
    expect(s.me(customer).memberships).toEqual([expect.objectContaining({ organisation_type: "customer" })]);
  });

  it("answers /partner-portal/me for partners and 403 for staff", () => {
    const s = createFakeState();
    const partner = s.authenticate(tokens(s.login(WORKSPACE, PARTNER.email, FAKE_PASSWORD)).access_token)!;
    expect(s.partnerMe(partner)).toMatchObject({ partners: [{ display_name: "Northcast Foundry" }] });
    const staff = s.authenticate(tokens(s.login(WORKSPACE, STAFF.email, FAKE_PASSWORD)).access_token)!;
    expect(s.partnerMe(staff)).toEqual({ status: 403 });
  });
});
