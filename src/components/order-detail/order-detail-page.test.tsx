import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatMoney } from "@/lib/format/money";

import { CLERK, FAKE_API_URL, NO_ACCESS, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { OrderDetailPage } from "./order-detail-page";

const orderId = (number: number) => `22222222-0000-4000-8000-${String(number).padStart(12, "0")}`;

const navigation = vi.hoisted(() => ({ id: "", notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  notFound: navigation.notFound,
}));

function open(number: number, user = STAFF) {
  navigation.id = orderId(number);
  return renderAs(user, <OrderDetailPage />);
}

beforeEach(() => navigation.notFound.mockReset());

describe("OrderDetailPage", () => {
  it("shows the order's number, state, customer and who placed it", async () => {
    open(1048);
    expect(await screen.findByRole("heading", { level: 1, name: "#1048" })).toBeInTheDocument();
    expect(screen.getByText(/^In production · /)).toBeInTheDocument();
    expect(screen.getByText("Luna Jewels")).toBeInTheDocument();
    expect(screen.getByText(/^Placed .* by Ana Ruiz$/)).toBeInTheDocument();
  });

  it("says why a cancelled order was cancelled", async () => {
    open(1054);
    expect(await screen.findByText(/Customer changed their mind/)).toBeInTheDocument();
  });

  it("says when an order doesn't exist", async () => {
    navigation.id = "00000000-0000-4000-8000-000000000000";
    renderAs(STAFF, <OrderDetailPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "This order doesn't exist" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Orders" })).toHaveAttribute("href", "/orders");
  });

  it("offers to try again when the order can't be loaded", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/orders/:id`, () =>
        HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 }),
      ),
    );
    open(1048);
    const retry = await screen.findByRole("button", { name: "Try again" });
    server.resetHandlers();
    await userEvent.click(retry);
    expect(await screen.findByRole("heading", { level: 1, name: "#1048" })).toBeInTheDocument();
  });

  it("is not found without order.read", () => {
    navigation.id = orderId(1048);
    renderAs(NO_ACCESS, <OrderDetailPage />);
    return vi.waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });

  it("shows only what this person may do", async () => {
    open(1042, CLERK);
    await screen.findByRole("heading", { level: 1, name: "#1042" });
    expect(screen.queryByRole("button", { name: "Ship" })).not.toBeInTheDocument();
  });

  it("keeps Ship disabled until the order is ready", async () => {
    open(1048);
    expect(await screen.findByRole("button", { name: "Ship" })).toBeDisabled();
  });

  it("shows the money as the order's own strings", async () => {
    open(1048);
    const payment = await screen.findByRole("region", { name: "Payment" });
    expect(within(payment).getByText("Total").parentElement).toHaveTextContent(formatMoney("2916.40", "EUR"));
    expect(within(payment).getByText("Tax 20%")).toBeInTheDocument();
  });

  it("marks a shipped order delivered", async () => {
    open(1051);
    await userEvent.click(await screen.findByRole("button", { name: "Mark delivered" }));
    expect(await screen.findByText("#1051 marked delivered.")).toBeInTheDocument();
    expect(fakeState().orders.all().find((order) => order.number === 1051)?.state).toBe("delivered");
  });

  it("doesn't offer Mark delivered before an order has shipped", async () => {
    open(1048);
    await screen.findByRole("region", { name: "Shipping" });
    expect(screen.queryByRole("button", { name: "Mark delivered" })).not.toBeInTheDocument();
  });
});
