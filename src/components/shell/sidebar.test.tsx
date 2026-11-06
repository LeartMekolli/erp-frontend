import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLERK, FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { createFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { Sidebar } from "./sidebar";

let pathname = "/orders";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

let paths: string[] = [];
beforeEach(() => {
  pathname = "/orders";
  paths = [];
  server.events.on("request:start", ({ request }) => paths.push(new URL(request.url).pathname));
});
afterEach(() => server.events.removeAllListeners());

describe("Sidebar", () => {
  it("shows the workspace name and how many orders need you", async () => {
    renderAs(STAFF, <Sidebar />);
    expect(await screen.findByText("Demo")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Orders, 10 need you" })).toHaveAttribute("href", "/orders");
  });

  it("marks the current link", async () => {
    pathname = "/orders";
    renderAs(STAFF, <Sidebar />);
    const orders = await screen.findByRole("link", { name: /^Orders/ });
    expect(orders).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Partners" })).not.toHaveAttribute("aria-current");
  });

  it("leaves out links and sections the person can't use", async () => {
    renderAs(CLERK, <Sidebar />);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    await within(nav).findByRole("link", { name: /^Orders/ });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent?.replace(/\s*\d+$/, ""))).toEqual(["Orders", "Claims"]);
    expect(screen.queryByText("Setup")).not.toBeInTheDocument();
  });

  it("asks for no count without order.read", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/me`, () => HttpResponse.json({ ...createFakeState().me(STAFF), permissions: ["catalog.read"] })),
    );
    renderAs(STAFF, <Sidebar />);
    expect(await screen.findByRole("link", { name: "Catalog" })).toBeInTheDocument();
    expect(paths).not.toContain("/orders/counts");
  });
});
