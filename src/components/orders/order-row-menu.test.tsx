import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/schema-types";

import { CLERK, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { OrderRowMenu } from "./order-row-menu";

const media = vi.hoisted(() => ({ wide: true }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => media.wide }));

beforeEach(() => {
  media.wide = true;
});

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

function renderMenu(number: number, user: FakeUser = STAFF) {
  const onShip = vi.fn();
  const onRecordPayment = vi.fn();
  renderAs(user, <OrderRowMenu order={order(number)} onShip={onShip} onRecordPayment={onRecordPayment} />);
  return { onShip, onRecordPayment };
}

async function openMenu(number: number) {
  await userEvent.click(await screen.findByRole("button", { name: `Actions for order #${number}` }));
}

describe("OrderRowMenu", () => {
  it("offers Ship on a ready order and says why there is nothing to collect", async () => {
    const { onShip } = renderMenu(1042);
    await openMenu(1042);
    const ship = await screen.findByRole("menuitem", { name: /^Ship/ });
    expect(ship).not.toHaveAttribute("aria-disabled");
    const pay = screen.getByRole("menuitem", { name: /^Record payment/ });
    expect(pay).toHaveAttribute("aria-disabled", "true");
    expect(pay).toHaveTextContent("Nothing to collect on this order");
    await userEvent.click(ship);
    expect(onShip).toHaveBeenCalledWith(order(1042));
  });

  it("offers Record payment on an order awaiting payment and says why it can't ship", async () => {
    const { onRecordPayment } = renderMenu(1045);
    await openMenu(1045);
    const ship = await screen.findByRole("menuitem", { name: /^Ship/ });
    expect(ship).toHaveAttribute("aria-disabled", "true");
    expect(ship).toHaveTextContent("Only ready orders can ship");
    await userEvent.click(screen.getByRole("menuitem", { name: /^Record payment/ }));
    expect(onRecordPayment).toHaveBeenCalledWith(order(1045));
  });

  it("shows Cancel disabled, for the order page", async () => {
    renderMenu(1045);
    await openMenu(1045);
    expect(await screen.findByRole("menuitem", { name: "Cancel on the order page" })).toHaveAttribute("aria-disabled", "true");
  });

  it("hides each action without its permission, and the menu with none", async () => {
    const { client } = renderAs(CLERK, <OrderRowMenu order={order(1042)} onShip={vi.fn()} onRecordPayment={vi.fn()} />);
    await waitFor(() => expect(client.getQueryData(["me"])).toBeDefined());
    expect(screen.queryByRole("button", { name: "Actions for order #1042" })).not.toBeInTheDocument();
  });

  it("opens the same actions in a sheet on phones", async () => {
    media.wide = false;
    const { onShip } = renderMenu(1042);
    await openMenu(1042);
    const sheet = await screen.findByRole("dialog", { name: "Order #1042" });
    expect(sheet).toHaveTextContent("Nothing to collect on this order");
    await userEvent.click(screen.getByRole("button", { name: /^Ship/ }));
    expect(onShip).toHaveBeenCalledWith(order(1042));
  });
});
