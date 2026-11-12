import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Order } from "@/lib/api/schema-types";

import { CLERK, FAKE_API_URL, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { ClaimsNote } from "./claims-note";
import { CommentsPanel } from "./comments-panel";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderPanel(number: number, user: FakeUser = STAFF) {
  const parent = order(number);
  renderAs(
    user,
    <WithMe>
      <p>Signed in</p>
      <ClaimsNote orderId={parent.id} />
      <CommentsPanel order={parent} />
    </WithMe>,
  );
  return parent;
}

let posted: unknown[] = [];
beforeEach(() => {
  posted = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/comments")) posted.push(await request.clone().json());
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

const list = () => screen.findByRole("list", { name: "Comments" });
const postButton = () => screen.getByRole("button", { name: "Post comment" });

describe("CommentsPanel", () => {
  it("shows each comment with its author and kind, newest last", async () => {
    renderPanel(1048);
    const items = within(await list()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Rina Holt")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Customer")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Ana Ruiz")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Staff")).toBeInTheDocument();
  });

  it("says which line a comment is on and when it went to the partner", async () => {
    renderPanel(1048);
    const staff = within(await list()).getAllByRole("listitem")[1]!;
    expect(within(staff).getByText("12 × Ring band")).toBeInTheDocument();
    expect(within(staff).getByText("To the partner")).toBeInTheDocument();
  });

  it("says who reads each staff comment, and nothing extra on a customer's own", async () => {
    const parent = order(1048);
    const answer = fakeState().comments.list(parent.id, new URLSearchParams());
    if (!answer.ok) throw new Error("expected comments");
    const [customer, partner] = answer.body.data;
    const staffOnly = { ...partner!, id: crypto.randomUUID(), line_id: null, visibility: "staff" as const, body: "Watch this one" };
    const toCustomer = { ...partner!, id: crypto.randomUUID(), line_id: null, visibility: "customer" as const, body: "On its way" };
    server.use(http.get(`${FAKE_API_URL}/orders/:id/comments`, () => HttpResponse.json({ data: [customer, staffOnly, toCustomer], next_cursor: null })));
    renderPanel(1048);
    const [first, second, third] = within(await list()).getAllByRole("listitem");
    expect(first).not.toHaveTextContent(/Staff only|To the/);
    expect(within(second!).getByText("Staff only")).toBeInTheDocument();
    expect(within(third!).getByText("To the customer")).toBeInTheDocument();
  });

  it("opens an attachment through a signed link", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    renderPanel(1048);
    await userEvent.click(await screen.findByRole("button", { name: "polish-sample.pdf" }));
    await waitFor(() => expect(tab.location.href).toMatch(/^https:\/\/storage\.example\.test\//));
    expect(tab.opener).toBeNull();
  });

  it("says when there are no comments", async () => {
    renderPanel(1049);
    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });

  it("offers newer comments when there are more", async () => {
    const parent = order(1048);
    const answer = fakeState().comments.list(parent.id, new URLSearchParams());
    if (!answer.ok) throw new Error("expected comments");
    const [first, second] = answer.body.data;
    server.use(
      http.get(`${FAKE_API_URL}/orders/:id/comments`, ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get("cursor") ? { data: [second], next_cursor: null } : { data: [first], next_cursor: "next" }),
      ),
    );
    renderPanel(1048);
    await screen.findByText("Rina Holt");
    await userEvent.click(screen.getByRole("button", { name: "Show newer comments" }));
    expect(await screen.findByText("Ana Ruiz")).toBeInTheDocument();
  });

  it("offers a retry when comments can't load", async () => {
    server.use(http.get(`${FAKE_API_URL}/orders/:id/comments`, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderPanel(1048);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("posting a comment", () => {
  it("starts on staff only, and says so", async () => {
    renderPanel(1049);
    expect(await screen.findByLabelText("Who reads it")).toHaveDisplayValue("Staff only");
    expect(screen.getByText("Only staff will read this")).toBeInTheDocument();
  });

  it("posts a staff-only comment to the order, saying so to erp-api", async () => {
    renderPanel(1049);
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Ready on Friday");
    await userEvent.click(postButton());
    expect(await screen.findByText("Ready on Friday")).toBeInTheDocument();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ body: "Ready on Friday", visibility: "staff" });
    await waitFor(() => expect(screen.getByLabelText("Add a comment")).toHaveValue(""));
    expect(screen.getByLabelText("Who reads it")).toHaveDisplayValue("Staff only");
  });

  it("sends a comment to the customer when picked", async () => {
    renderPanel(1049);
    await userEvent.selectOptions(await screen.findByLabelText("Who reads it"), "The customer");
    expect(screen.getByText("The customer will read this")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Add a comment"), "Ready on Friday");
    await userEvent.click(postButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ body: "Ready on Friday", visibility: "customer" });
  });

  it("sends a line's comment to the partner holding it", async () => {
    const parent = renderPanel(1048);
    await userEvent.selectOptions(await screen.findByLabelText("About"), "12 × Ring band");
    await userEvent.selectOptions(screen.getByLabelText("Who reads it"), "Northcast Foundry");
    expect(screen.getByText("Northcast Foundry will read this, not the customer")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Add a comment"), "Keep the polish matte");
    await userEvent.click(postButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ body: "Keep the polish matte", line_id: parent.lines[0]!.id, visibility: "partner" });
  });

  it("goes back to staff only when the line is changed away from the partner's", async () => {
    renderPanel(1048);
    const about = await screen.findByLabelText("About");
    await userEvent.selectOptions(about, "12 × Ring band");
    await userEvent.selectOptions(screen.getByLabelText("Who reads it"), "Northcast Foundry");
    await userEvent.selectOptions(about, "The whole order");
    expect(screen.getByLabelText("Who reads it")).toHaveDisplayValue("Staff only");
    expect(screen.getByText("Only staff will read this")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Northcast Foundry" })).not.toBeInTheDocument();
  });

  it("goes back to staff only when the line's partner lets go of it", async () => {
    const parent = order(1048);
    const panel = (o: Order) => (
      <WithMe>
        <CommentsPanel order={o} />
      </WithMe>
    );
    const { rerender } = renderAs(STAFF, panel(parent));
    await userEvent.selectOptions(await screen.findByLabelText("About"), "12 × Ring band");
    await userEvent.selectOptions(screen.getByLabelText("Who reads it"), "Northcast Foundry");
    const released: Order = {
      ...parent,
      lines: parent.lines.map((line, index) => (index === 0 ? { ...line, partner: { ...line.partner!, status: "offered" } } : line)),
    };
    rerender(panel(released));
    expect(screen.getByText("Only staff will read this")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Add a comment"), "Keep the polish matte");
    await userEvent.click(postButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ visibility: "staff" });
  });

  it("keeps the customer picked when the line changes", async () => {
    renderPanel(1048);
    await userEvent.selectOptions(await screen.findByLabelText("Who reads it"), "The customer");
    await userEvent.selectOptions(screen.getByLabelText("About"), "12 × Ring band");
    expect(screen.getByLabelText("Who reads it")).toHaveDisplayValue("The customer");
  });

  it("doesn't offer the partner on a line that's only been offered", async () => {
    renderPanel(1049);
    await userEvent.selectOptions(await screen.findByLabelText("About"), "4 × Facade panel");
    expect(within(screen.getByLabelText("Who reads it")).getAllByRole("option").map((option) => option.textContent)).toEqual(["Staff only", "The customer"]);
  });

  it("shows erp-api's refusal of the reader above the form", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/orders/:id/comments`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Bad Request", status: 400, errors: [{ path: "visibility", message: "A comment for the partner needs a line" }] },
          { status: 400 },
        ),
      ),
    );
    renderPanel(1049);
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Hello");
    await userEvent.click(postButton());
    expect(await screen.findByText(/A comment for the partner needs a line/)).toBeInTheDocument();
  });

  it("wants something written", async () => {
    renderPanel(1049);
    await screen.findByLabelText("Add a comment");
    await userEvent.click(postButton());
    expect(await screen.findByText("Write something first.")).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it("shows no form without order.write, and comments still read", async () => {
    renderPanel(1048, CLERK);
    await list();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });
});

describe("ClaimsNote", () => {
  it("counts only the claims still open", async () => {
    renderPanel(1048);
    expect(await screen.findByText("1 open claim")).toBeInTheDocument();
  });

  it("says nothing with no claims", async () => {
    renderPanel(1049);
    await screen.findByText("No comments yet.");
    expect(screen.queryByText(/open claim/)).not.toBeInTheDocument();
  });
});
