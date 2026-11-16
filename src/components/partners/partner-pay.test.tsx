import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, NORTHCAST_ID, PAYER, STAFF, STAFF_MEMBER } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";
import { settle, until } from "../../../test/wait";

import { PartnerPage } from "./partner-page";

const navigation = vi.hoisted(() => ({ id: "", search: "", replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
  notFound: navigation.notFound,
}));

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

/** How many times Pay reached erp-api. */
let pays = 0;

/** Northcast's account is ready; each test says whether its seeded pending payout (€420.00) has settled. */
function northcastReady() {
  fakeState().earnings.setAccount(NORTHCAST_ID, "ready");
}
const settledPaid = () => fakeState().earnings.settlePending(NORTHCAST_ID, "paid");

beforeEach(() => {
  navigation.id = NORTHCAST_ID;
  navigation.search = "";
  navigation.replace.mockReset();
  navigation.notFound.mockReset();
  pays = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname === `/partners/${NORTHCAST_ID}/payouts`) pays += 1;
  });
  northcastReady();
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
  setOnline(true);
});

const owedRegion = () => screen.findByRole("region", { name: "What's owed" });
const payButton = () => screen.getByRole("button", { name: /^Pay €/ });

/** Opens the confirm dialog from Pay and returns it. */
async function openPay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Pay €1,240.00" }));
  return screen.findByRole("dialog", { name: "Pay Northcast Foundry €1,240.00?" });
}

describe("PartnerPay", () => {
  it("shows what's owed and Pay with its amount", async () => {
    settledPaid();
    renderAs(STAFF, <PartnerPage />);

    expect(within(await owedRegion()).getByText("€1,240.00")).toBeInTheDocument();
    expect(screen.getByText("Payouts ready")).toBeInTheDocument();
    const pay = await screen.findByRole("button", { name: "Pay €1,240.00" });
    expect(pay).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/^Last payout: Paid · €420\.00 · /)).toBeInTheDocument();
  });

  it("pays after confirming", async () => {
    settledPaid();
    const user = userEvent.setup();
    renderAs(STAFF, <PartnerPage />);

    const dialog = await openPay(user);
    expect(within(dialog).getByText(/^This sends everything owed now to their payout account\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Pay" }));

    expect(await screen.findByText(/^Last payout: On its way · €1,240\.00 · /)).toBeInTheDocument();
    await until(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await until(() => expect(within(screen.getByRole("region", { name: "What's owed" })).getByText("€0.00")).toBeInTheDocument());
    await until(() => expect(payButton()).toHaveFocus());
    expect(pays).toBe(1);
  });

  it("pays once on a double click", async () => {
    settledPaid();
    const user = userEvent.setup();
    renderAs(STAFF, <PartnerPage />);

    const dialog = await openPay(user);
    await user.dblClick(within(dialog).getByRole("button", { name: "Pay" }));

    expect(await screen.findByText(/^Last payout: On its way · €1,240\.00 · /)).toBeInTheDocument();
    await settle();
    expect(pays).toBe(1);
  });

  it("shows a failed payout and its money back", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: Date.parse("2026-11-16T10:00:00Z") });
    resetFakeState();
    northcastReady();
    settledPaid();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAs(STAFF, <PartnerPage />);

    const dialog = await openPay(user);
    await user.click(within(dialog).getByRole("button", { name: "Pay" }));
    expect(await screen.findByText(/^Last payout: On its way · €1,240\.00 · /)).toBeInTheDocument();
    await until(() => expect(within(screen.getByRole("region", { name: "What's owed" })).getByText("€0.00")).toBeInTheDocument());

    fakeState().earnings.settlePending(NORTHCAST_ID, "failed", "The bank account was closed");
    act(() => vi.advanceTimersByTime(15_000));

    await until(() => expect(screen.getByText(/^Last payout: Failed\. Owed again · €1,240\.00 · /)).toBeInTheDocument());
    expect(screen.getByText("The payment provider said: The bank account was closed")).toBeInTheDocument();
    await until(() => expect(within(screen.getByRole("region", { name: "What's owed" })).getByText("€1,240.00")).toBeInTheDocument());
  });

  it("explains nothing due", async () => {
    settledPaid();
    const user = userEvent.setup();
    renderAs(STAFF, <PartnerPage />);

    const dialog = await openPay(user);
    // Someone else, in another tab, pays first.
    fakeState().earnings.pay(NORTHCAST_ID, null);
    await user.click(within(dialog).getByRole("button", { name: "Pay" }));

    expect(await screen.findByText("There's nothing to pay now. Someone may have just paid them.")).toBeInTheDocument();
    await until(() => expect(payButton()).toHaveAccessibleDescription("A payout is on its way."));
    expect(payButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("explains an account no longer ready", async () => {
    settledPaid();
    const user = userEvent.setup();
    renderAs(STAFF, <PartnerPage />);

    const dialog = await openPay(user);
    fakeState().earnings.setAccount(NORTHCAST_ID, "restricted");
    await user.click(within(dialog).getByRole("button", { name: "Pay" }));

    expect(await screen.findByText("This partner's payout account isn't ready any more.")).toBeInTheDocument();
    expect(await screen.findByText("The payment provider needs more from this partner")).toBeInTheDocument();
    expect(payButton()).toHaveAttribute("aria-disabled", "true");
    expect(payButton()).toHaveAccessibleDescription("The payment provider needs more from this partner");
  });

  it("waits while a payout is on its way", async () => {
    const user = userEvent.setup();
    renderAs(STAFF, <PartnerPage />);

    const pay = await screen.findByRole("button", { name: "Pay €1,240.00" });
    expect(pay).toHaveAttribute("aria-disabled", "true");
    expect(pay).toHaveAccessibleDescription("A payout is on its way.");
    expect(screen.getByText(/^Last payout: On its way · €420\.00 · /)).toBeInTheDocument();

    await user.click(pay);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides Pay without payment.read", async () => {
    navigation.search = "tab=payouts";
    renderAs(PAYER, <PartnerPage />);

    expect(within(await owedRegion()).getByText("€1,240.00")).toBeInTheDocument();
    await settle();
    expect(screen.queryByRole("button", { name: /^Pay/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Last payout/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Payouts" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");
  });

  it("hides Pay from a member", async () => {
    // Not ready, so the setup link would show to someone with `partner.write`.
    fakeState().earnings.setAccount(NORTHCAST_ID, "not_connected");
    renderAs(STAFF_MEMBER, <PartnerPage />);

    expect(within(await owedRegion()).getByText("€1,240.00")).toBeInTheDocument();
    expect(await screen.findByText(/^Last payout: On its way · €420\.00 · /)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Payouts" })).toBeInTheDocument();
    expect(screen.getByText("Payouts not set up")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy setup link" })).not.toBeInTheDocument();
  });

  it("says when the payouts couldn't be loaded, in Pay's place", async () => {
    settledPaid();
    server.use(http.get(`${FAKE_API_URL}/partners/:id/payouts`, () => HttpResponse.json({}, { status: 500 }), { once: true }));
    const user = userEvent.setup();
    renderAs(STAFF, <PartnerPage />);

    expect(await screen.findByText("This partner's payouts couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /^Pay/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("button", { name: "Pay €1,240.00" })).toBeInTheDocument();
    expect(screen.queryByText("This partner's payouts couldn't be loaded.")).not.toBeInTheDocument();
  });

  it("disables Pay offline", async () => {
    settledPaid();
    renderAs(STAFF, <PartnerPage />);

    const pay = await screen.findByRole("button", { name: "Pay €1,240.00" });
    expect(pay).not.toHaveAttribute("aria-disabled", "true");

    act(() => setOnline(false));

    expect(pay).toHaveAttribute("aria-disabled", "true");
    expect(pay).toHaveAccessibleDescription("You're offline.");
  });
});
