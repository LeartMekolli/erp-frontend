import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CUSTOMER_INVITE_TOKEN,
  EXPIRED_INVITE_TOKEN,
  FAKE_API_URL,
  LAYERLINE_OWNER,
  PARTNER_EXISTING_INVITE_TOKEN,
  PARTNER_INVITE_TOKEN,
  STAFF,
  STAFF_EXISTING_INVITE_TOKEN,
  STAFF_INVITE_TOKEN,
  USED_TOKEN,
} from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import { AcceptInvitationForm } from "./accept-invitation-form";

const PREVIEW_URL = `${FAKE_API_URL}/auth/invitations/preview`;
const STAFF_URL = `${FAKE_API_URL}/auth/invitations/accept`;
const PARTNER_URL = `${FAKE_API_URL}/auth/partner-invitations/accept`;
const PASSWORD = "a-long-password-1";
const INVALID = "This invitation has expired or was already used. Ask whoever invited you to send a new one.";
const JOINED = "You're in. Sign in to get started.";

const openLink = (token: string | null) =>
  window.history.replaceState(
    null,
    "",
    token ? `/accept-invitation#token=${encodeURIComponent(token)}` : "/accept-invitation",
  );

// Each request with the address bar as it was when it left, then on to the fake erp-api.
let sent: { url: string; body: unknown; hash: string }[] = [];
const record = (url: string) =>
  http.post(url, async ({ request }) => {
    sent.push({ url, body: await request.clone().json(), hash: window.location.hash });
  });

beforeEach(() => {
  sent = [];
  server.use(record(PREVIEW_URL), record(STAFF_URL), record(PARTNER_URL));
});
afterEach(() => window.history.replaceState(null, "", "/"));

async function join(fields: { name?: string; password?: string }, user = userEvent.setup()) {
  if (fields.name !== undefined) await user.type(screen.getByLabelText("Your name"), fields.name);
  if (fields.password !== undefined) await user.type(screen.getByLabelText("Password"), fields.password);
  await user.click(screen.getByRole("button", { name: "Join" }));
  return user;
}

describe("AcceptInvitationForm", () => {
  it("removes the token from the address before any request", async () => {
    openLink(STAFF_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    expect(window.location.hash).toBe("");
    await screen.findByRole("heading", { name: "Join Demo" });
    expect(sent).toEqual([{ url: PREVIEW_URL, body: { token: STAFF_INVITE_TOKEN }, hash: "" }]);
  });

  it("greets someone new invited as staff, then creates their account", async () => {
    openLink(STAFF_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    expect(await screen.findByRole("heading", { level: 1, name: "Join Demo" })).toBeInTheDocument();
    expect(screen.getByText("You're invited as Sales, with invited@demo.example.test.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription("At least 12 characters.");
    await join({ name: "Ana", password: PASSWORD });
    expect(await screen.findByRole("status")).toHaveTextContent(JOINED);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(sent.at(-1)).toMatchObject({ url: STAFF_URL, body: { token: STAFF_INVITE_TOKEN, name: "Ana", password: PASSWORD } });
  });

  it("greets someone new invited to a workshop, and joins on the partner route", async () => {
    openLink(PARTNER_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    expect(
      await screen.findByText("You're invited to work for Northcast Foundry as Member, with invited@northcast.example.test."),
    ).toBeInTheDocument();
    await join({ name: "Pia", password: PASSWORD });
    expect(await screen.findByRole("status")).toHaveTextContent(JOINED);
    expect(sent.at(-1)).toMatchObject({ url: PARTNER_URL, body: { token: PARTNER_INVITE_TOKEN, name: "Pia" } });
  });

  it("joins a workshop with one click for someone who already has an account", async () => {
    openLink(PARTNER_EXISTING_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    expect(
      await screen.findByText(`You're invited to work for Northcast Foundry as Admin, with ${LAYERLINE_OWNER.email}.`),
    ).toBeInTheDocument();
    expect(screen.getByText("You already use AMI, so your password stays the same.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    await join({});
    expect(await screen.findByRole("status")).toHaveTextContent(JOINED);
    expect(sent.at(-1)).toEqual({ url: PARTNER_URL, body: { token: PARTNER_EXISTING_INVITE_TOKEN }, hash: "" });
  });

  it("sends someone invited as staff who already has an account to sign in", async () => {
    openLink(STAFF_EXISTING_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `${STAFF.email} already has an account in Demo. Sign in with it instead.`,
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
  });

  it("sends a customer invitation to the customer site", async () => {
    openLink(CUSTOMER_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invitation is for ordering. Use your supplier's customer site to accept it.",
    );
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
  });

  it.each([
    ["a used", USED_TOKEN],
    ["an expired", EXPIRED_INVITE_TOKEN],
    ["an unknown", "not-a-token"],
  ])("explains %s invitation", async (_, token) => {
    openLink(token);
    render(<AcceptInvitationForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent(INVALID);
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
  });

  it("explains a link with no token without calling erp-api", async () => {
    openLink(null);
    render(<AcceptInvitationForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(INVALID);
    await waitFor(() => expect(sent).toHaveLength(0));
  });

  it("asks for a name and a long enough password without calling erp-api", async () => {
    openLink(STAFF_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    await screen.findByRole("heading", { name: "Join Demo" });
    await join({ password: "too-short" });
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 12 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveAttribute("aria-invalid", "true");
    expect(sent.map((s) => s.url)).toEqual([PREVIEW_URL]);
  });

  it("explains an invitation erp-api turns down on joining", async () => {
    server.use(
      http.post(STAFF_URL, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "A user with this email already exists" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    openLink(STAFF_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    await screen.findByRole("heading", { name: "Join Demo" });
    await join({ name: "Ana", password: PASSWORD });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invitation can't be used with this email. Ask whoever invited you.",
    );
  });

  it("locks the form while joining", async () => {
    server.use(
      http.post(STAFF_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    openLink(STAFF_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    await screen.findByRole("heading", { name: "Join Demo" });
    await join({ name: "Ana", password: PASSWORD });
    expect(await screen.findByRole("button", { name: "Joining…" })).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    await screen.findByRole("status");
  });

  it("offers to try again when erp-api can't be reached", async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.error(), { once: true }));
    openLink(STAFF_INVITE_TOKEN);
    render(<AcceptInvitationForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AMI can't reach the server right now. Try again in a moment.",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Join Demo" })).toBeInTheDocument();
  });
});
