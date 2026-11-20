import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLERK, NO_ACCESS, ORDER_TAKER, ORDER_WRITER, STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { OrdersPage } from "./orders-page";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => "/orders",
  notFound: navigation.notFound,
}));

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.notFound.mockReset();
});

describe("OrdersPage", () => {
  it("shows the title, the tiles, the tabs and the list", async () => {
    renderAs(STAFF, <OrdersPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Need you today" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /^Needs you/ })).toBeInTheDocument();
    expect(await screen.findByRole("row", { name: /#1041\b/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New order" })).toHaveAttribute("href", "/orders/new");
  });

  it("a tile narrows the list to its reason without touching the URL", async () => {
    renderAs(STAFF, <OrdersPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /^All/ }));
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(await screen.findByRole("button", { name: "2 late" }));
    expect(screen.getByRole("tab", { name: /^Needs you/ })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("button", { name: "Remove filter: Late" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("leaves out New order without order.write", async () => {
    renderAs(CLERK, <OrdersPage />);
    await screen.findByRole("heading", { level: 1, name: "Orders" });
    expect(screen.queryByRole("link", { name: "New order" })).not.toBeInTheDocument();
  });

  it("Orders shows New order only to who can place orders", async () => {
    const { unmount } = renderAs(ORDER_WRITER, <OrdersPage />);
    await screen.findByRole("heading", { level: 1, name: "Orders" });
    expect(screen.queryByRole("link", { name: "New order" })).not.toBeInTheDocument();
    unmount();
    renderAs(ORDER_TAKER, <OrdersPage />);
    expect(await screen.findByRole("link", { name: "New order" })).toHaveAttribute("href", "/orders/new");
  });

  it("is not found without order.read", async () => {
    renderAs(NO_ACCESS, <OrdersPage />);
    await vi.waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });
});
