import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLERK, FAKE_API_URL, STAFF } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

import { Bell } from "./bell";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }), usePathname: () => "/orders" }));

beforeEach(() => push.mockReset());

async function openPanel() {
  await userEvent.click(await screen.findByRole("button", { name: /^Notifications/ }));
  return screen.findByRole("dialog", { name: "Notifications" });
}

describe("Bell", () => {
  it("shows how many are unread", async () => {
    renderAs(STAFF, <Bell />);
    const bell = await screen.findByRole("button", { name: "Notifications, 3 unread" });
    expect(within(bell).getByText("3")).toBeInTheDocument();
  });

  it("caps the badge at 9+", async () => {
    server.use(http.get(`${FAKE_API_URL}/notifications/unread-count`, () => HttpResponse.json({ count: 12 })));
    renderAs(STAFF, <Bell />);
    const bell = await screen.findByRole("button", { name: "Notifications, 12 unread" });
    expect(within(bell).getByText("9+")).toBeInTheDocument();
  });

  it("shows no badge at 0", async () => {
    renderAs(CLERK, <Bell />);
    const bell = await screen.findByRole("button", { name: "Notifications" });
    expect(within(bell).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it("lists entries newest first and loads more", async () => {
    renderAs(STAFF, <Bell />);
    const panel = await openPanel();
    await waitFor(() => expect(within(panel).getAllByRole("listitem")).toHaveLength(20));
    expect(within(panel).getAllByRole("listitem")[0]).toHaveTextContent("Order #1041 is 2 days late");
    expect(within(panel).getAllByRole("listitem")[0]).toHaveTextContent("Unread");
    await userEvent.click(within(panel).getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(within(panel).getAllByRole("listitem")).toHaveLength(30));
  });

  it("opening an order notification marks it read and goes to the order", async () => {
    renderAs(STAFF, <Bell />);
    const panel = await openPanel();
    await userEvent.click(await within(panel).findByRole("button", { name: /Order #1041 is 2 days late/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/orders\/[0-9a-f-]+$/)));
    expect(fakeState().notifications.unread(STAFF.id)).toBe(2);
  });

  it("a notification with nowhere to go is marked read and the panel stays", async () => {
    renderAs(STAFF, <Bell />);
    const panel = await openPanel();
    await userEvent.click(await within(panel).findByRole("button", { name: /AI use is at 80%/ }));
    await waitFor(() => expect(fakeState().notifications.unread(STAFF.id)).toBe(2));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  });

  it("says when you're all caught up", async () => {
    renderAs(CLERK, <Bell />);
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    const panel = await openPanel();
    expect(await within(panel).findByText("You're all caught up.")).toBeInTheDocument();
  });
});
