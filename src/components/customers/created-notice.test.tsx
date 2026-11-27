import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { InvitationEmailStatus, SentInvitation } from "@/lib/api/schema-types";

import { FAKE_API_URL, LUNA_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { CreatedNotice } from "./created-notice";

const invitation = (email_status: InvitationEmailStatus): SentInvitation => ({
  id: "5e5e5e5e-0000-4000-8000-000000000001",
  email: "sofia@atelier.example",
  role: "owner",
  expires_at: "2026-12-04T09:00:00.000Z",
  email_status,
});

describe("CreatedNotice", () => {
  it("is in the page as an empty live region first, then says it was created", async () => {
    renderAs(STAFF, <CreatedNotice customerId={LUNA_ID} name="Luna Jewels" invitation={invitation("queued")} />);
    // Right after the first render: the region is there, holding nothing yet, so its text is announced.
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    expect(await screen.findByText("Luna Jewels was created.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("An invitation is on its way to sofia@atelier.example.");
  });

  it("moves focus to the notice when Send again's email is on its way, and hands the answer up", async () => {
    const onChange = vi.fn();
    renderAs(STAFF, <CreatedNotice customerId={LUNA_ID} name="Luna Jewels" invitation={invitation("failed")} onChange={onChange} />);
    const send = await screen.findByRole("button", { name: "Send again" });

    fakeState().catalog.setInvitationEmail("queued");
    await userEvent.click(send);

    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("An invitation is on its way to sofia@atelier.example."));
    expect(screen.queryByRole("button", { name: "Send again" })).not.toBeInTheDocument();
    expect(status.parentElement).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ email: "sofia@atelier.example", email_status: "queued" }));
  });

  it("says a failed connection on Send again got no answer", async () => {
    server.use(http.post(`${FAKE_API_URL}/customers/:id/invitations`, () => HttpResponse.error(), { once: true }));
    renderAs(STAFF, <CreatedNotice customerId={LUNA_ID} name="Luna Jewels" invitation={invitation("failed")} />);

    await userEvent.click(await screen.findByRole("button", { name: "Send again" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AMI can't reach the server right now. Try again in a moment.");
    expect(screen.getByRole("button", { name: "Send again" })).toBeEnabled();
  });

  it("links to the customer's page in a new tab when asked to", async () => {
    renderAs(STAFF, <CreatedNotice customerId={LUNA_ID} name="Luna Jewels" invitation={null} openLink />);
    const link = await screen.findByRole("link", { name: "Open Luna Jewels (opens in a new tab)" });
    expect(link).toHaveAttribute("href", `/customers/${LUNA_ID}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
