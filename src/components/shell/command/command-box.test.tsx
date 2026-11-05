import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, STAFF } from "../../../../test/fake-erp-api/seed";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

import { CommandBox } from "./command-box";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }), usePathname: () => "/orders" }));

beforeEach(() => push.mockReset());

async function openBox() {
  renderAs(STAFF, <CommandBox />);
  await userEvent.click(await screen.findByRole("button", { name: /^Search/ }));
  return screen.findByRole("dialog", { name: "Search" });
}

describe("CommandBox", () => {
  it("⌘K opens and Escape closes", async () => {
    renderAs(STAFF, <CommandBox />);
    await screen.findByRole("button", { name: /^Search/ });
    await userEvent.keyboard("{Meta>}k{/Meta}");
    const box = await screen.findByRole("dialog", { name: "Search" });
    expect(within(box).getByPlaceholderText("Search or ask a question")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Ctrl+K opens it too, and focus returns to the search button on close", async () => {
    const box = await openBox();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(box).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Search/ })).toHaveFocus();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Search" })).toBeInTheDocument();
  });

  it("says what it searches before anything is typed", async () => {
    const box = await openBox();
    expect(within(box).getByText("Type to search orders, customers, partners and help.")).toBeInTheDocument();
  });

  it("shows grouped results", async () => {
    const box = await openBox();
    await userEvent.type(within(box).getByPlaceholderText("Search or ask a question"), "in");
    const customers = await within(box).findByRole("group", { name: "Customers" });
    expect(within(customers).getByRole("option", { name: "Brightline Optics" })).toBeInTheDocument();
    expect(within(box).getByRole("group", { name: "Partners" })).toHaveTextContent("Layerline Prints");
    expect(within(box).getByRole("group", { name: "Help" })).toHaveTextContent("Shipping with a courier account");
  });

  it("hides groups that came back empty", async () => {
    const box = await openBox();
    await userEvent.type(within(box).getByPlaceholderText("Search or ask a question"), "104");
    const orders = await within(box).findByRole("group", { name: "Orders" });
    expect(within(orders).getByRole("option", { name: "#1041 · Fieldnote Studio" })).toBeInTheDocument();
    expect(within(orders).getAllByRole("option")).toHaveLength(5);
    for (const name of ["Customers", "Partners", "Help"])
      expect(within(box).queryByRole("group", { name })).not.toBeInTheDocument();
  });

  it("does not show an older answer after a newer one", async () => {
    server.use(
      http.get(
        `${FAKE_API_URL}/search`,
        async () => {
          await delay(400);
          return HttpResponse.json({ orders: [], customers: [{ id: crypto.randomUUID(), name: "Stale Answer" }], partners: [], articles: [] });
        },
        { once: true },
      ),
    );
    const box = await openBox();
    const input = within(box).getByPlaceholderText("Search or ask a question");
    await userEvent.type(input, "Lu");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.type(input, "na");
    expect(await within(box).findByRole("option", { name: "Luna Jewels" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(within(box).queryByText("Stale Answer")).not.toBeInTheDocument();
    expect(within(box).getByRole("option", { name: "Luna Jewels" })).toBeInTheDocument();
  });

  it("Enter opens the order and closes the box", async () => {
    const box = await openBox();
    await userEvent.type(within(box).getByPlaceholderText("Search or ask a question"), "1041");
    await within(box).findByRole("option", { name: "#1041 · Fieldnote Studio" });
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/orders/22222222-0000-4000-8000-000000001041");
    await waitFor(() => expect(box).not.toBeInTheDocument());
  });

  it("finds an order typed with its #", async () => {
    const box = await openBox();
    await userEvent.type(within(box).getByPlaceholderText("Search or ask a question"), "#1041");
    expect(await within(box).findByRole("option", { name: "#1041 · Fieldnote Studio" })).toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    const box = await openBox();
    await userEvent.type(within(box).getByPlaceholderText("Search or ask a question"), "zzz");
    expect(await within(box).findByText('Nothing matches "zzz".')).toBeInTheDocument();
  });
});
