import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import {
  CUSTOMER_INVITE_TOKEN,
  EXPIRED_INVITE_TOKEN,
  FAKE_API_URL,
  PARTNER_EXISTING_INVITE_TOKEN,
  PARTNER_INVITE_TOKEN,
  STAFF_EXISTING_INVITE_TOKEN,
  STAFF_INVITE_TOKEN,
  USED_TOKEN,
  WORKSPACE,
} from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";

import { acceptInvitation, previewInvitation } from "./invitation";

const PASSWORD = "a-long-password-1";

describe("previewInvitation", () => {
  it("describes a staff invitation for someone new", async () => {
    expect(await previewInvitation(STAFF_INVITE_TOKEN)).toEqual({
      kind: "staff",
      status: "pending",
      email: "invited@demo.example.test",
      role: "Sales",
      workspace: { name: "Demo" },
      organisation: null,
      has_account: false,
    });
  });

  it("describes a partner invitation for someone with an account", async () => {
    expect(await previewInvitation(PARTNER_EXISTING_INVITE_TOKEN)).toMatchObject({
      kind: "partner",
      organisation: { name: "Northcast Foundry" },
      has_account: true,
    });
  });

  it("says when an invitation was used or has expired", async () => {
    expect(await previewInvitation(USED_TOKEN)).toMatchObject({ status: "accepted" });
    expect(await previewInvitation(EXPIRED_INVITE_TOKEN)).toMatchObject({ status: "expired" });
  });

  it("is null for a token erp-api never issued", async () => {
    expect(await previewInvitation("not-a-token")).toBeNull();
  });

  it("throws when erp-api can't be reached", async () => {
    server.use(http.post(`${FAKE_API_URL}/auth/invitations/preview`, () => HttpResponse.error()));
    await expect(previewInvitation(STAFF_INVITE_TOKEN)).rejects.toThrow();
  });
});

describe("acceptInvitation", () => {
  it("accepts a staff invitation on the staff route", async () => {
    expect(await acceptInvitation({ kind: "staff", token: STAFF_INVITE_TOKEN, name: "Ana", password: PASSWORD })).toBe(
      "accepted",
    );
    expect(fakeState().login(WORKSPACE, "invited@demo.example.test", PASSWORD)).toHaveProperty("access_token");
  });

  it("accepts a partner invitation for someone new on the partner route", async () => {
    expect(
      await acceptInvitation({ kind: "partner", token: PARTNER_INVITE_TOKEN, name: "Pia", password: PASSWORD }),
    ).toBe("accepted");
    expect(fakeState().login(WORKSPACE, "invited@northcast.example.test", PASSWORD)).toHaveProperty("access_token");
  });

  it("accepts a partner invitation with only the token for someone with an account", async () => {
    expect(await acceptInvitation({ kind: "partner", token: PARTNER_EXISTING_INVITE_TOKEN })).toBe("accepted");
  });

  it("is invalid for a used or expired invitation", async () => {
    expect(await acceptInvitation({ kind: "staff", token: USED_TOKEN, name: "Ana", password: PASSWORD })).toBe("invalid");
    expect(await acceptInvitation({ kind: "staff", token: EXPIRED_INVITE_TOKEN, name: "Ana", password: PASSWORD })).toBe(
      "invalid",
    );
  });

  it("is taken when erp-api refuses the email", async () => {
    expect(
      await acceptInvitation({ kind: "staff", token: STAFF_EXISTING_INVITE_TOKEN, name: "Dana", password: PASSWORD }),
    ).toBe("taken");
  });

  it("hands back field errors as a problem", async () => {
    expect(await acceptInvitation({ kind: "staff", token: STAFF_INVITE_TOKEN, name: "Ana", password: "short" })).toEqual({
      problem: expect.objectContaining({ errors: [expect.objectContaining({ path: "password" })] }),
    });
  });

  it("never accepts a customer invitation", async () => {
    // AMI has no route for customers: the type allows only staff and partner.
    // @ts-expect-error customers accept on their storefront
    await expect(acceptInvitation({ kind: "customer", token: CUSTOMER_INVITE_TOKEN })).rejects.toThrow();
  });

  it("throws when erp-api can't be reached", async () => {
    server.use(http.post(`${FAKE_API_URL}/auth/invitations/accept`, () => HttpResponse.error()));
    await expect(
      acceptInvitation({ kind: "staff", token: STAFF_INVITE_TOKEN, name: "Ana", password: PASSWORD }),
    ).rejects.toThrow();
  });
});
