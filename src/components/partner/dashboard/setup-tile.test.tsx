import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PartnerMeResponse } from "@/lib/api/schema-types";

import { FAKE_API_URL, LAYERLINE_ID, NORTHCAST_ADMIN, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER, PARTNER_TWO_SHOPS, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs, WithMe } from "../../../../test/render";

import { PartnerDashboardPage } from "./dashboard-page";

const navigation = vi.hoisted(() => ({ partnerId: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/dashboard`,
  useParams: () => ({ partnerId: navigation.partnerId }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

/** Every submit the page sent. */
let submits = 0;
beforeEach(() => {
  navigation.partnerId = NORTHCAST_ID;
  submits = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/submit")) submits += 1;
  });
  // Northcast, being set up, with everything before submitting done.
  fakeState().setPartnerSettingUp(NORTHCAST_ID);
  fakeState().earnings.setAccount(NORTHCAST_ID, "ready");
});
afterEach(() => server.events.removeAllListeners());

async function setupTile(user: FakeUser) {
  renderAs(
    user,
    <WithMe>
      <PartnerDashboardPage />
    </WithMe>,
  );
  const tile = await screen.findByRole("region", { name: "Setup still to finish" });
  await within(tile).findByText("Submit for approval", { selector: "span" });
  return tile;
}

const stepRow = (tile: HTMLElement, label: string) => within(tile).getByText(label, { selector: "span" }).closest("li")!;

describe("Submit for approval on the Setup tile", () => {
  it("lets the owner submit, then waits for staff", async () => {
    const tile = await setupTile(PARTNER);
    await userEvent.click(within(tile).getByRole("button", { name: "Submit for approval" }));
    await waitFor(() => expect(stepRow(tile, "Approved by staff")).toHaveTextContent("Waiting"));
    expect(stepRow(tile, "Submit for approval")).toHaveTextContent("Done");
    expect(within(tile).queryByRole("button", { name: "Submit for approval" })).not.toBeInTheDocument();
    expect(submits).toBe(1);
  });

  it("can't be pressed twice while it's being sent", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/partner-portal/partners/:partnerId/submit`, async () => {
        await delay(50);
        const answer = fakeState().submitSetup(NORTHCAST_ID);
        if (!answer.ok) throw new Error("expected the fake to take the submission");
        return HttpResponse.json(answer.body);
      }),
    );
    const tile = await setupTile(PARTNER);
    const button = within(tile).getByRole("button", { name: "Submit for approval" });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    await waitFor(() => expect(stepRow(tile, "Approved by staff")).toHaveTextContent("Waiting"));
    expect(submits).toBe(1);
  });

  it("tells an admin the owner sends it", async () => {
    const tile = await setupTile(NORTHCAST_ADMIN);
    expect(stepRow(tile, "Submit for approval")).toHaveTextContent("Your owner sends this");
    expect(within(tile).queryByRole("button", { name: "Submit for approval" })).not.toBeInTheDocument();
  });

  it("shows a member the step only", async () => {
    const tile = await setupTile(NORTHCAST_MEMBER);
    expect(stepRow(tile, "Submit for approval")).not.toHaveTextContent("Your owner sends this");
    expect(within(tile).queryByRole("button", { name: "Submit for approval" })).not.toBeInTheDocument();
  });

  it("offers no button until the steps before it are done", async () => {
    fakeState().earnings.setAccount(NORTHCAST_ID, "not_connected");
    const tile = await setupTile(PARTNER);
    await within(tile).findByText("Payout account", { selector: "span" });
    expect(within(tile).queryByRole("button", { name: "Submit for approval" })).not.toBeInTheDocument();
  });

  it("says why when staff approved first, then catches up", async () => {
    const tile = await setupTile(PARTNER);
    fakeState().approvePartner(NORTHCAST_ID);
    await userEvent.click(within(tile).getByRole("button", { name: "Submit for approval" }));
    expect(await within(tile).findByText("Only a partner being set up can be submitted for approval")).toBeInTheDocument();
    expect(await within(tile).findByText("All set up.")).toBeInTheDocument();
  });

  it("offers the button only at the workshop the person owns", async () => {
    // A member of Northcast (ready to submit) who owns Layerline: Northcast's tile has no button.
    const me: PartnerMeResponse = {
      user: { id: PARTNER_TWO_SHOPS.id, name: PARTNER_TWO_SHOPS.name, email: PARTNER_TWO_SHOPS.email },
      partners: [
        { id: NORTHCAST_ID, display_name: "Northcast Foundry", role: "member", status: "setting_up", submitted_at: null },
        { id: LAYERLINE_ID, display_name: "Layerline Prints", role: "owner", status: "approved", submitted_at: null },
      ],
    };
    server.use(http.get(`${FAKE_API_URL}/partner-portal/me`, () => HttpResponse.json(me)));
    const tile = await setupTile(PARTNER_TWO_SHOPS);
    expect(within(tile).queryByRole("button", { name: "Submit for approval" })).not.toBeInTheDocument();
  });
});
