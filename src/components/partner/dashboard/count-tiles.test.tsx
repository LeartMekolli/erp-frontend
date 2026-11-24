import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { PartnerSummary } from "@/lib/api/schema-types";

import { FAKE_API_URL, NORTHCAST_ID, NORTHCAST_MEMBER } from "../../../../test/fake-erp-api/seed";
import { server } from "../../../../test/msw";
import { renderAs, WithMe } from "../../../../test/render";

import { CountTiles } from "./count-tiles";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/dashboard`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const SUMMARY: PartnerSummary = {
  range: { from: "2026-10-26", to: "2026-11-24", previous_from: "2026-09-26", previous_to: "2026-10-25", bucket: "day" },
  jobs_finished: 14,
  previous_jobs_finished: 11,
  steps: [],
};

function renderTiles(summary: PartnerSummary | undefined) {
  return renderAs(
    NORTHCAST_MEMBER,
    <WithMe>
      <CountTiles summary={summary} words="last 30 days" />
    </WithMe>,
  );
}

const tile = (name: string | RegExp) => screen.findByRole("region", { name });

describe("CountTiles", () => {
  it("counts the jobs in progress and due soon right now", async () => {
    renderTiles(SUMMARY);
    const inProgress = await tile("In progress");
    expect(await within(inProgress).findByText("2")).toBeInTheDocument();
    expect(inProgress).toHaveTextContent("right now");
    const dueSoon = await tile("Due in 2 working days");
    expect(await within(dueSoon).findByText("1")).toBeInTheDocument();
  });

  it("says when jobs are past their due date, not only in red", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs/counts`, () =>
        HttpResponse.json({ offered: 2, accepted: 3, finished: 1, late: 1, due_soon: 0 }),
      ),
    );
    renderTiles(SUMMARY);
    const late = await tile("Late");
    expect(await within(late).findByText("1")).toHaveClass("text-late-ink");
    expect(late).toHaveTextContent("▲ Past their due date");
  });

  it("has no warning with nothing late", async () => {
    renderTiles(SUMMARY);
    const late = await tile("Late");
    expect(await within(late).findByText("0")).not.toHaveClass("text-late-ink");
    expect(late).not.toHaveTextContent("Past their due date");
  });

  it("compares the jobs finished in the range with the range before", async () => {
    renderTiles(SUMMARY);
    const finished = await tile("Finished · last 30 days");
    expect(within(finished).getByText("14")).toBeInTheDocument();
    expect(finished).toHaveTextContent("▲ 27%");
    expect(finished).toHaveTextContent("vs previous 30 days");
  });

  it("waits for the summary before showing what was finished", async () => {
    renderTiles(undefined);
    const finished = await tile("Finished · last 30 days");
    expect(within(finished).getByRole("status")).toBeInTheDocument();
  });
});
