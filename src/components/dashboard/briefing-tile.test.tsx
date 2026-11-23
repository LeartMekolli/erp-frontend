import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, SALES_LEAD, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs, WithMe } from "../../../test/render";

import { BriefingTile } from "./briefing-tile";

const SUMMARY = /^Orders are steady/;

/** The dashboard reads since the last reset. */
let reads = 0;

beforeEach(() => {
  // The clock moves on its own, so Testing Library's waits and the fetches run; tests can also jump it.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  reads = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "GET" && new URL(request.url).pathname === "/reports/dashboard") reads += 1;
  });
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const renderTile = (who = STAFF) => renderAs(who, <WithMe>{<BriefingTile />}</WithMe>);

describe("BriefingTile", () => {
  it("shows the summary and its suggestions", async () => {
    renderTile();
    expect(await screen.findByText(SUMMARY)).toBeInTheDocument();
    const suggestions = screen.getByRole("list", { name: "Suggestions" });
    expect(within(suggestions).getAllByRole("listitem")).toHaveLength(3);
    expect(within(suggestions).getByRole("link", { name: "#1041" })).toHaveAttribute("href", expect.stringMatching(/^\/orders\//));
  });

  it("isn't there for someone who may not see partners", async () => {
    renderAs(SALES_LEAD, <WithMe>{<BriefingTile />}</WithMe>);
    await waitFor(() => expect(reads).toBeGreaterThan(0));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(screen.queryByRole("region", { name: "AI briefing" })).not.toBeInTheDocument();
  });

  it("says why when AI is off", async () => {
    fakeState().reports.setAiOff("limit_used");
    renderTile();
    expect(await screen.findByText("This month's AI limit is used.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write a new one" })).not.toBeInTheDocument();
  });

  it("shows Writing… until erp-api has written the new briefing", async () => {
    renderTile();
    await screen.findByText(SUMMARY);
    await user().click(screen.getByRole("button", { name: "Write a new one" }));
    expect(await screen.findByText("Writing…")).toBeInTheDocument();

    // While `ai.pending` is true the dashboard is read every few seconds: jump the clock a second at a time
    // until it's written. (Not inside waitFor: a jump would also run out waitFor's own timer.)
    for (let second = 0; second < 10 && screen.queryByText("Writing…"); second += 1) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(screen.queryByText("Writing…")).not.toBeInTheDocument();
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();
    expect(screen.getByText(/^Written \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write a new one" })).toBeInTheDocument();
  });

  it("shows erp-api's reason for a 409 and reads nothing more", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/reports/dashboard/briefing`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "A briefing was written less than 15 minutes ago" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderTile();
    await screen.findByText(SUMMARY);
    await user().click(screen.getByRole("button", { name: "Write a new one" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A briefing was written less than 15 minutes ago");
    expect(screen.queryByText("Writing…")).not.toBeInTheDocument();
    reads = 0;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reads).toBe(0);
  });

  it("moves a dismissed suggestion under Dismissed, and Undo brings it back", async () => {
    renderTile();
    await screen.findByText(SUMMARY);
    const late = "Order #1041 is 2 days late and no workshop has taken its job.";
    await user().click(screen.getByRole("button", { name: `Dismiss for 14 days: ${late}` }));

    const dismissed = await screen.findByText("Dismissed (1)");
    expect(screen.queryByText(late)).not.toBeInTheDocument();
    await user().click(dismissed);
    await user().click(screen.getByRole("button", { name: "Undo: Offer a job" }));

    expect(await screen.findByText(late)).toBeInTheDocument();
    expect(screen.queryByText(/^Dismissed \(/)).not.toBeInTheDocument();
  });
});
