import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, LAYERLINE_ID, NORTHCAST_ID, NO_ACCESS, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { PartnersPage } from "./partners-page";

const navigation = vi.hoisted(() => ({ notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  notFound: navigation.notFound,
}));

beforeEach(() => navigation.notFound.mockReset());

describe("PartnersPage", () => {
  it("lists partners with their status and payouts", async () => {
    renderAs(STAFF, <PartnersPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Partners" })).toBeInTheDocument();

    const northcast = await screen.findByRole("link", { name: /Northcast Foundry/ });
    expect(northcast).toHaveAttribute("href", `/partners/${NORTHCAST_ID}`);
    expect(northcast).toHaveTextContent("Approved");
    expect(northcast).toHaveTextContent("Payouts not set up");

    const layerline = screen.getByRole("link", { name: /Layerline Prints/ });
    expect(layerline).toHaveAttribute("href", `/partners/${LAYERLINE_ID}`);
    expect(layerline).toHaveTextContent("Payouts ready");
  });

  it("says when there are none", async () => {
    server.use(http.get(`${FAKE_API_URL}/partners`, () => HttpResponse.json({ data: [], next_cursor: null })));
    renderAs(STAFF, <PartnersPage />);
    expect(await screen.findByText("No partners yet.")).toBeInTheDocument();
  });

  it("is not found without partner.read", async () => {
    renderAs(NO_ACCESS, <PartnersPage />);
    await waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });
});
