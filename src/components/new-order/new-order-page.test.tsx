import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ORDER_TAKER, ORDER_WRITER } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { LeaveDialog } from "./leave-dialog";
import { NewOrderPage } from "./new-order-page";
import { useLeaveGuard } from "./use-leave-guard";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => "/orders/new",
  notFound: navigation.notFound,
}));

/** What reached the document after the leave guard: a click it let through shows up here, unprevented. */
let reached: boolean[] = [];
function recordClick(event: MouseEvent) {
  reached.push(event.defaultPrevented);
  // jsdom can't navigate.
  event.preventDefault();
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.notFound.mockReset();
  reached = [];
  document.addEventListener("click", recordClick);
});

afterEach(() => {
  document.removeEventListener("click", recordClick);
});

describe("NewOrderPage", () => {
  it("is not found without quote.create", async () => {
    renderAs(ORDER_WRITER, <NewOrderPage />);
    await vi.waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });

  it("shows the four sections with only the customer open", async () => {
    renderAs(ORDER_TAKER, <NewOrderPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "New order" })).toBeInTheDocument();
    const titles = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(titles).toEqual(["Customer", "Product", "Price", "Delivery"]);
    expect(screen.getByRole("region", { name: "Customer" })).toBeInTheDocument();
    expect(screen.getByText("Pick a customer first.")).toBeInTheDocument();
    expect(screen.getByText("Fill in the product first.")).toBeInTheDocument();
    expect(screen.getByText("Get a price first.")).toBeInTheDocument();
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("leaves at once when nothing is entered", async () => {
    renderAs(
      ORDER_TAKER,
      <>
        <a href="/orders">Orders</a>
        <NewOrderPage />
      </>,
    );
    await screen.findByRole("heading", { level: 1, name: "New order" });
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    // The click went through unprevented and no question was asked.
    expect(reached).toEqual([false]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(navigation.push).toHaveBeenCalledWith("/orders");
  });

  it("asks before leaving with a customer picked", async () => {
    renderAs(
      ORDER_TAKER,
      <>
        <a href="/orders">Orders</a>
        <NewOrderPage />
      </>,
    );
    await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "Luna");
    await userEvent.click(await screen.findByRole("option", { name: "Luna Jewels" }));
    // The customer is set once loaded, which also opens the product section.
    await waitFor(() => expect(screen.queryByText("Pick a customer first.")).not.toBeInTheDocument());

    // Only the link's click counts; picking the customer clicked too.
    reached = [];
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(await screen.findByRole("dialog", { name: "Leave this order?" })).toBeInTheDocument();
    expect(reached).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "New order" })).toBeInTheDocument();
    expect(screen.getByText("Group: Trade · Pays first · Plan: Free")).toBeInTheDocument();
  });
});

function Harness({ dirty }: { dirty: boolean }) {
  const guard = useLeaveGuard(dirty);
  return (
    <>
      <a href="/orders">Orders</a>
      <a href="/orders" target="_blank" rel="noreferrer">
        Orders in a new tab
      </a>
      <a href="https://elsewhere.example.test/page">Elsewhere</a>
      <a href="/orders/new#top">Top</a>
      <button type="button" onClick={() => guard.requestLeave("/orders")}>
        Cancel
      </button>
      <LeaveDialog {...guard.dialog} />
    </>
  );
}

describe("useLeaveGuard", () => {
  it("asks before leaving with a customer picked", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(await screen.findByRole("dialog", { name: "Leave this order?" })).toBeInTheDocument();
    expect(screen.getByText("What you've entered here will be lost.")).toBeInTheDocument();
    // The page's own links never saw the click.
    expect(reached).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigation.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    expect(navigation.push).toHaveBeenCalledWith("/orders");
    expect(navigation.push).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends Cancel through the same dialog", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("dialog", { name: "Leave this order?" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("lets modifier clicks, new tabs, other sites and the same page through", async () => {
    window.history.pushState({}, "", "/orders/new");
    render(<Harness dirty />);
    fireEvent.click(screen.getByRole("link", { name: "Orders" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Orders" }), { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Orders in a new tab" }));
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    fireEvent.click(screen.getByRole("link", { name: "Top" }));
    expect(reached).toEqual([false, false, false, false, false]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks the browser before the tab closes only while dirty", () => {
    const closing = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const { rerender } = render(<Harness dirty={false} />);
    expect(closing()).toBe(false);
    rerender(<Harness dirty />);
    expect(closing()).toBe(true);
    rerender(<Harness dirty={false} />);
    expect(closing()).toBe(false);
  });
});
