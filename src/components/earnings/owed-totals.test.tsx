import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { FAKE_API_URL, NORTHCAST_ID, PARTNER, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs, WithMe } from "../../../test/render";
import { usePartnerOwed } from "@/lib/partner-earnings/queries";
import { useStaffPartnerOwed } from "@/lib/partners/queries";

import { OwedTotals } from "./owed-totals";

function Totals() {
  const owed = usePartnerOwed(NORTHCAST_ID, { enabled: true, poll: false });
  return <OwedTotals owed={owed} audience="partner" />;
}

function StaffTotals() {
  const owed = useStaffPartnerOwed(NORTHCAST_ID, { poll: false });
  return <OwedTotals owed={owed} audience="staff" />;
}

describe("OwedTotals", () => {
  it("shows what's owed and still being earned", async () => {
    renderAs(PARTNER, <Totals />);

    expect(await screen.findByText("€1,240.00")).toBeInTheDocument();
    expect(screen.getByText("Owed now")).toBeInTheDocument();
    expect(screen.getByText("Still being earned")).toBeInTheDocument();
    expect(screen.getByText("€380.00")).toBeInTheDocument();
    expect(screen.getByText("· 3 jobs")).toBeInTheDocument();
    expect(screen.getByText("Paid when the workspace sends a payout.")).toBeInTheDocument();
  });

  it("shows nothing owed for a negative total", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/partner-portal/partners/:partnerId/owed`, ({ request }) => {
        const answer = fakeState().earnings.owed(NORTHCAST_ID, new URL(request.url).searchParams);
        if (!answer.ok) throw new Error("the fake refused");
        return HttpResponse.json({ ...answer.body, due_total: "-40.00" });
      }),
    );
    renderAs(PARTNER, <Totals />);

    expect(await screen.findByText("€0.00")).toBeInTheDocument();
    expect(screen.queryByText("-€40.00")).not.toBeInTheDocument();
  });

  it("says when the totals can't be loaded", async () => {
    server.use(http.get(`${FAKE_API_URL}/partner-portal/partners/:partnerId/owed`, () => HttpResponse.json({}, { status: 500 })));
    renderAs(PARTNER, <Totals />);

    expect(await screen.findByText("What you're owed couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("words the numbers for staff", async () => {
    renderAs(
      STAFF,
      <WithMe>
        <StaffTotals />
      </WithMe>,
    );

    expect(await screen.findByText("€1,240.00")).toBeInTheDocument();
    expect(screen.getByText("Owed now")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "What's owed" })).toBeInTheDocument();
    expect(screen.queryByText("Paid when the workspace sends a payout.")).not.toBeInTheDocument();
  });
});
