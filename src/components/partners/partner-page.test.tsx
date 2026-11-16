import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NORTHCAST_ID, PAYER, STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { PartnerPage } from "./partner-page";

const navigation = vi.hoisted(() => ({ id: "", search: "", replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
  notFound: navigation.notFound,
}));

beforeEach(() => {
  navigation.id = NORTHCAST_ID;
  navigation.search = "";
  navigation.replace.mockReset();
  navigation.notFound.mockReset();
});

describe("PartnerPage", () => {
  it("heads the page with the partner", async () => {
    renderAs(STAFF, <PartnerPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Northcast Foundry" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Partners" })).toHaveAttribute("href", "/partners");
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("says when a partner isn't there", async () => {
    navigation.id = "00000000-0000-4000-8000-000000000000";
    renderAs(STAFF, <PartnerPage />);
    expect(await screen.findByRole("heading", { name: "This partner doesn't exist or was removed." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Partners" })).toHaveAttribute("href", "/partners");
  });

  it("puts the Payouts tab in the address", async () => {
    renderAs(STAFF, <PartnerPage />);
    await screen.findByRole("heading", { level: 1, name: "Northcast Foundry" });
    expect(screen.getByRole("tablist", { name: "This partner's pay" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("tab", { name: "Payouts" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(`/partners/${NORTHCAST_ID}?tab=payouts`, { scroll: false });
  });

  it("shows Payouts only with payment.read", async () => {
    navigation.search = "tab=payouts";
    renderAs(PAYER, <PartnerPage />);
    await screen.findByRole("heading", { level: 1, name: "Northcast Foundry" });
    expect(screen.queryByRole("tab", { name: "Payouts" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");
  });
});
