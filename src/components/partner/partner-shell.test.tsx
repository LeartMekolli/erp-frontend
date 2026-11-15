import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NORTHCAST_ADMIN, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER, PARTNER_TWO_SHOPS } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { PartnerShell } from "./partner-shell";

let pathname = `/partner-portal/${NORTHCAST_ID}/jobs`;
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  pathname = `/partner-portal/${NORTHCAST_ID}/jobs`;
});

function renderShell(user: typeof PARTNER) {
  return renderAs(
    user,
    <PartnerShell>
      <p>page</p>
    </PartnerShell>,
  );
}

describe("PartnerShell", () => {
  it("lists the partner's sections", async () => {
    renderShell(PARTNER);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    // Earnings waits for the person's role.
    await within(nav).findByRole("link", { name: "Earnings" });
    for (const [label, section] of [
      ["Dashboard", "dashboard"],
      ["Jobs", "jobs"],
      ["Earnings", "earnings"],
      ["Performance", "performance"],
      ["Setup", "setup"],
      ["Prices", "prices"],
      ["Team", "team"],
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/${section}`);
    }
    expect(within(nav).getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Team" })).not.toHaveAttribute("aria-current");
  });

  it("shows Earnings to admins and owners only", async () => {
    for (const user of [PARTNER, NORTHCAST_ADMIN]) {
      const { unmount } = renderShell(user);
      const nav = await screen.findByRole("navigation", { name: "Main" });
      expect(await within(nav).findByRole("link", { name: "Earnings" })).toBeInTheDocument();
      unmount();
    }

    renderShell(NORTHCAST_MEMBER);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    // The workshop's name comes with the role: once it shows, the role is known.
    await screen.findByText("Northcast Foundry");
    expect(within(nav).queryByRole("link", { name: "Earnings" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Jobs" })).toBeInTheDocument();
  });

  it("names the workshop", async () => {
    renderShell(PARTNER);
    expect(await screen.findByText("Northcast Foundry")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Switch workshop" })).not.toBeInTheDocument();
    expect(screen.queryByText("Your workshop is suspended. You can finish the jobs you have, but you can't take new ones.")).not.toBeInTheDocument();
  });

  it("offers to switch workshop", async () => {
    renderShell(PARTNER_TWO_SHOPS);
    expect(await screen.findByRole("link", { name: "Switch workshop" })).toHaveAttribute("href", "/partner-portal");
  });

  it("shows the suspended banner", async () => {
    fakeState().suspendPartner(NORTHCAST_ID);
    renderShell(PARTNER);
    const banner = await screen.findByText("Your workshop is suspended. You can finish the jobs you have, but you can't take new ones.");
    // Inside a live region that was there before it, so it's read when it appears.
    expect(banner.closest("[role=status]")).not.toBeNull();
  });

  it("has no search", async () => {
    renderShell(PARTNER);
    expect(await screen.findByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search or ask a question/ })).not.toBeInTheDocument();
  });
});
