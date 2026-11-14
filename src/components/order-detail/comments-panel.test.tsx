import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Order, OrderComment } from "@/lib/api/schema-types";

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
      <CommentsPanel order={parent} now={Date.now()} />
    </WithMe>,
  );
  return parent;
}

/** Order #1048's seeded comments: staff's on the order, then staff's on the line Northcast holds. */
function seeded(): OrderComment[] {
  const answer = fakeState().comments.list(order(1048).id, new URLSearchParams());
  if (!answer.ok) throw new Error("expected comments");
  return answer.body.data;
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
    expect(within(items[0]!).getByText("Ana Ruiz")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Staff")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Rina asked for the polish to stay matte.")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Matte polish on these, please.")).toBeInTheDocument();
  });

  it("says which line a comment is on", async () => {
    renderPanel(1048);
    const [onOrder, onLine] = within(await list()).getAllByRole("listitem");
    expect(within(onLine!).getByText("12 × Ring band")).toBeInTheDocument();
    expect(onOrder).not.toHaveTextContent("Ring band");
  });

  it("labels each comment by who reads it", async () => {
    const [staffOnly, withPartner] = seeded();
    const customer: OrderComment = {
      ...staffOnly!,
      id: crypto.randomUUID(),
      author: { kind: "customer", id: crypto.randomUUID(), name: "Rina Holt" },
      attachments: [],
      body: "Could the polish stay matte?",
    };
    server.use(http.get(`${FAKE_API_URL}/orders/:id/comments`, () => HttpResponse.json({ data: [staffOnly, withPartner, customer], next_cursor: null })));
    renderPanel(1048);
    const [first, second, third] = within(await list()).getAllByRole("listitem");
    expect(within(first!).getByText("Staff only")).toBeInTheDocument();
    expect(within(second!).getByText("With Northcast Foundry")).toBeInTheDocument();
    expect(within(third!).getByText("Customer")).toBeInTheDocument();
    expect(third).not.toHaveTextContent(/Staff only|With /);
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
    const [first, second] = seeded();
    server.use(
      http.get(`${FAKE_API_URL}/orders/:id/comments`, ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get("cursor") ? { data: [second], next_cursor: null } : { data: [first], next_cursor: "next" }),
      ),
    );
    renderPanel(1048);
    await screen.findByText("Rina asked for the polish to stay matte.");
    await userEvent.click(screen.getByRole("button", { name: "Show newer comments" }));
    expect(await screen.findByText("Matte polish on these, please.")).toBeInTheDocument();
  });

  it("offers a retry when comments can't load", async () => {
    server.use(http.get(`${FAKE_API_URL}/orders/:id/comments`, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderPanel(1048);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("posting a comment", () => {
  it("says only staff will read a comment on the order", async () => {
    renderPanel(1048);
    expect(await screen.findByLabelText("About")).toHaveDisplayValue("The whole order");
    expect(screen.getByText("Only staff will read this.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveAccessibleDescription("Only staff will read this.");
    expect(screen.queryByLabelText("Who reads it")).not.toBeInTheDocument();
  });

  it("names the partner who will read a line's comment", async () => {
    renderPanel(1048);
    await userEvent.selectOptions(await screen.findByLabelText("About"), "12 × Ring band");
    expect(screen.getByText("Northcast Foundry will read this.")).toBeInTheDocument();
  });

  it("says only staff will read a line that's only been offered", async () => {
    renderPanel(1049);
    await userEvent.selectOptions(await screen.findByLabelText("About"), "4 × Facade panel");
    expect(screen.getByText("Only staff will read this.")).toBeInTheDocument();
  });

  it("posts with who the box said would read it", async () => {
    const parent = renderPanel(1048);
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Ready on Friday");
    await userEvent.click(postButton());
    expect(await screen.findByText("Ready on Friday")).toBeInTheDocument();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ body: "Ready on Friday", readers: "staff" });
    await waitFor(() => expect(screen.getByLabelText("Add a comment")).toHaveValue(""));

    await userEvent.selectOptions(screen.getByLabelText("About"), "12 × Ring band");
    await userEvent.type(screen.getByLabelText("Add a comment"), "Keep the polish matte");
    await userEvent.click(postButton());
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toEqual({ body: "Keep the polish matte", line_id: parent.lines[0]!.id, readers: parent.lines[0]!.partner!.id });
    const comment = (await screen.findByText("Keep the polish matte")).closest("li")!;
    expect(within(comment).getByText("With Northcast Foundry")).toBeInTheDocument();
    expect(screen.getByLabelText("About")).toHaveDisplayValue("The whole order");
  });

  it("goes back to staff only when the line's partner lets go of it", async () => {
    const parent = order(1048);
    const panel = (o: Order) => (
      <WithMe>
        <CommentsPanel order={o} now={Date.now()} />
      </WithMe>
    );
    const { rerender } = renderAs(STAFF, panel(parent));
    await userEvent.selectOptions(await screen.findByLabelText("About"), "12 × Ring band");
    expect(screen.getByText("Northcast Foundry will read this.")).toBeInTheDocument();
    const released: Order = {
      ...parent,
      lines: parent.lines.map((line, index) => (index === 0 ? { ...line, partner: { ...line.partner!, status: "offered" } } : line)),
    };
    rerender(panel(released));
    expect(screen.getByText("Only staff will read this.")).toBeInTheDocument();
  });

  describe("when a workshop accepted the line meanwhile", () => {
    /** Order #1048 as a page loaded before Northcast accepted its line: the fake erp-api knows better. */
    function renderStale() {
      const parent = order(1048);
      const stale: Order = {
        ...parent,
        lines: parent.lines.map((line, index) => (index === 0 ? { ...line, partner: { ...line.partner!, status: "offered" } } : line)),
      };
      renderAs(
        STAFF,
        <WithMe>
          <CommentsPanel order={stale} now={Date.now()} />
        </WithMe>,
      );
      return parent;
    }

    async function postStale() {
      const parent = renderStale();
      await userEvent.selectOptions(await screen.findByLabelText("About"), "12 × Ring band");
      expect(screen.getByText("Only staff will read this.")).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Add a comment"), "Keep the price low");
      await userEvent.click(postButton());
      expect(await screen.findByText("Not posted. Northcast Foundry accepted this line meanwhile and will read this.")).toBeInTheDocument();
      expect(posted[0]).toEqual({ body: "Keep the price low", line_id: parent.lines[0]!.id, readers: "staff" });
      return parent;
    }

    it("posts nothing and names who would read it now", async () => {
      await postStale();
      expect(screen.getByText("Northcast Foundry will read this.")).toBeInTheDocument();
      expect(screen.getByLabelText("Add a comment")).toHaveValue("Keep the price low");
      expect(screen.queryByText("Keep the price low", { selector: "li *" })).not.toBeInTheDocument();
    });

    it("posts anyway for that workshop to read", async () => {
      const parent = await postStale();
      await userEvent.click(screen.getByRole("button", { name: "Post anyway" }));
      await waitFor(() => expect(posted).toHaveLength(2));
      expect(posted[1]).toEqual({ body: "Keep the price low", line_id: parent.lines[0]!.id, readers: parent.lines[0]!.partner!.id });
      const comment = (await screen.findByText("Keep the price low", { selector: "li *" })).closest("li")!;
      expect(within(comment).getByText("With Northcast Foundry")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Post comment" })).toBeInTheDocument();
    });

    it("posts on the order instead, for staff only", async () => {
      await postStale();
      await userEvent.click(screen.getByRole("button", { name: "Post on the order instead" }));
      await waitFor(() => expect(posted).toHaveLength(2));
      expect(posted[1]).toEqual({ body: "Keep the price low", readers: "staff" });
      const comment = (await screen.findByText("Keep the price low", { selector: "li *" })).closest("li")!;
      expect(within(comment).getByText("Staff only")).toBeInTheDocument();
      expect(screen.getByLabelText("About")).toHaveDisplayValue("The whole order");
      expect(screen.queryByRole("button", { name: "Post on the order instead" })).not.toBeInTheDocument();
    });
  });

  it("shows erp-api's refusal above the form", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/orders/:id/comments`, () =>
        HttpResponse.json(
          { type: "urn:problem:validation", title: "Validation failed", status: 400, errors: [{ path: "line_id", message: "not a line of this order" }] },
          { status: 400 },
        ),
      ),
    );
    renderPanel(1049);
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Hello");
    await userEvent.click(postButton());
    expect(await screen.findByText(/not a line of this order/)).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Hello");
  });

  it("puts erp-api's refusal of the text on the field", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/orders/:id/comments`, () =>
        HttpResponse.json(
          { type: "urn:problem:validation", title: "Validation failed", status: 400, errors: [{ path: "body", message: "must be 1 to 5000 characters" }] },
          { status: 400 },
        ),
      ),
    );
    renderPanel(1049);
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Hello");
    await userEvent.click(postButton());
    expect(await screen.findByText("must be 1 to 5000 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveAttribute("aria-invalid", "true");
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
