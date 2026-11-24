import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkshopHomePage from "@/app/partner-portal/[partnerId]/page";

import { LAYERLINE_ID, LAYERLINE_OWNER, NORTHCAST_ADMIN, NORTHCAST_ID, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { renderAs, WithMe } from "../../../../test/render";

import { PartnerDashboardPage } from "./dashboard-page";

const navigation = vi.hoisted(() => ({ partnerId: "", redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/dashboard`,
  useParams: () => ({ partnerId: navigation.partnerId }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  redirect: navigation.redirect,
}));

beforeEach(() => {
  navigation.partnerId = NORTHCAST_ID;
  navigation.redirect.mockReset();
});

// The fake workspace's time zone is UTC, so its today is the UTC date.
const today = () => new Date().toISOString().slice(0, 10);

/** Today's Casting row from the fake, for the hero's figure. */
function castingToday() {
  const answer = fakeState().partnerDashboard.capacity(NORTHCAST_ID, new URLSearchParams({ from: today(), to: today() }));
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body.data.find((row) => row.step_type.key === "casting")!;
}

function renderPage(user: FakeUser = NORTHCAST_ADMIN) {
  return renderAs(
    user,
    <WithMe>
      <PartnerDashboardPage />
    </WithMe>,
  );
}

const hero = (name: RegExp) => screen.findByRole("region", { name });

describe("PartnerDashboardPage", () => {
  it("shows the title and greets the person by first name", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText(/^Good (morning|afternoon|evening), Ines\./)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Date range" })).toBeInTheDocument();
  });

  it("leads with the busiest step's workload against its capacity", async () => {
    renderPage();
    const tile = await hero(/^Waiting for Casting · last 30 days$/);
    expect(within(tile).getByText(String(castingToday().load), { selector: "p" })).toBeInTheDocument();
    expect(within(tile).getByText(/pieces waiting · capacity 50 a day/)).toBeInTheDocument();
    expect(within(tile).getByRole("figure", { name: /Waiting for Casting/ })).toBeInTheDocument();
    expect(within(tile).getByRole("button", { name: "Casting" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the step with its chip", async () => {
    const user = userEvent.setup();
    renderPage();
    const tile = await hero(/^Waiting for Casting/);
    await user.click(within(tile).getByRole("button", { name: "Polishing" }));
    expect(await hero(/^Waiting for Polishing · last 30 days$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Polishing" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the last range on screen, busy, while another loads", async () => {
    const { container } = renderPage();
    await hero(/^Waiting for Casting · last 30 days$/);
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    const bento = container.querySelector("[aria-busy]");
    expect(bento).toHaveAttribute("aria-busy", "true");
    expect(bento).toHaveClass("opacity-60");
    expect(screen.getByRole("region", { name: /^Waiting for Casting/ })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("[aria-busy]")).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByRole("region", { name: /^Waiting for Casting · last 7 days$/ })).toBeInTheDocument();
  });

  it("says no workload is recorded yet for a workshop with no steps", async () => {
    navigation.partnerId = LAYERLINE_ID;
    fakeState().partnerDashboard.clearCapabilities(LAYERLINE_ID);
    renderPage(LAYERLINE_OWNER);
    // The tile has this title while it loads too, so wait for the answer, not the title.
    const tile = await hero(/^Workload · last 30 days$/);
    expect(await within(tile).findByText("No workload recorded yet. AMI records it each night for the steps you can do.")).toBeInTheDocument();
    expect(within(tile).queryByRole("button")).toBeNull();
  });
});

describe("the workshop's home address", () => {
  it("opens the dashboard", async () => {
    await WorkshopHomePage({ params: Promise.resolve({ partnerId: NORTHCAST_ID }) });
    expect(navigation.redirect).toHaveBeenCalledWith(`/partner-portal/${NORTHCAST_ID}/dashboard`);
  });
});
