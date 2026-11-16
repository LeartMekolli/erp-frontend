import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { NORTHCAST_ADMIN, NORTHCAST_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs, WithMe } from "../../../test/render";
import { useStaffPartnerPayouts } from "@/lib/partners/queries";

import { PayoutsTab, type PayoutView } from "./payouts-tab";

/**
 * One failed payout carrying everything only staff may read (the provider's words, the order behind a
 * job), for one job whose product was removed and one that still has its product.
 */
const FAILED_WITH_STAFF_FIELDS: PayoutView = {
  id: "c9c9c9c9-0000-4000-8000-000000000001",
  partner_id: NORTHCAST_ID,
  amount: "300.00",
  currency: "EUR",
  status: "failed",
  failure: "The bank account was closed",
  created_at: "2026-11-10T09:00:00.000Z",
  settled_at: "2026-11-11T09:00:00.000Z",
  jobs: [
    {
      assignment_id: "c9c9c9c9-0000-4000-8000-000000000002",
      group_id: "c9c9c9c9-0000-4000-8000-000000000003",
      product: null,
      quantity: 2,
      amount: "100.00",
      order: { id: "c9c9c9c9-0000-4000-8000-000000000004", number: 1042, line_position: 0 },
    },
    {
      assignment_id: "c9c9c9c9-0000-4000-8000-000000000005",
      group_id: "c9c9c9c9-0000-4000-8000-000000000006",
      product: { name: "Bangle" },
      quantity: 12,
      amount: "200.00",
      order: { id: "c9c9c9c9-0000-4000-8000-000000000007", number: 1041, line_position: 1 },
    },
  ],
};

/** A loaded, one-page payouts list holding `items`. */
function loaded(items: PayoutView[]): ComponentProps<typeof PayoutsTab>["payouts"] {
  return {
    items,
    isPending: false,
    isError: false,
    error: null,
    refetch: () => undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    pageCount: 1,
    fetchNextPage: () => undefined,
  };
}

/** Renders the tab for `audience` with the failed payout above, and opens its jobs. */
async function openFailed(audience: "partner" | "staff") {
  const user = userEvent.setup();
  renderAs(
    audience === "staff" ? STAFF : NORTHCAST_ADMIN,
    <WithMe>
      <PayoutsTab payouts={loaded([FAILED_WITH_STAFF_FIELDS])} audience={audience} />
    </WithMe>,
  );
  await user.click(await screen.findByRole("button", { expanded: false }));
  return within(screen.getByRole("list", { name: "Jobs this payout paid for" }));
}

function StaffPayouts({ withDetail = false }: { withDetail?: boolean }) {
  const payouts = useStaffPartnerPayouts(NORTHCAST_ID, true);
  return (
    <PayoutsTab
      payouts={payouts}
      audience="staff"
      jobDetail={withDetail ? (job) => <p>{`Detail for ${job.assignment_id}`}</p> : undefined}
    />
  );
}

const renderStaff = (ui: ReactNode) => renderAs(STAFF, <WithMe>{ui}</WithMe>);

describe("PayoutsTab", () => {
  it("words payouts for staff", async () => {
    renderStaff(<StaffPayouts />);

    const rows = await screen.findAllByRole("button", { expanded: false });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("On its way");
    expect(rows[2]).toHaveTextContent("Failed. Owed again");
    expect(screen.getByText("The payment provider said: The partner's bank refused the transfer")).toBeInTheDocument();
  });

  it("shows each job's detail", async () => {
    const user = userEvent.setup();
    renderStaff(<StaffPayouts withDetail />);
    const [first] = await screen.findAllByRole("button", { expanded: false });
    expect(screen.queryByText(/^Detail for /)).not.toBeInTheDocument();

    await user.click(first!);

    const jobs = within(screen.getByRole("list", { name: "Jobs this payout paid for" }));
    expect(jobs.getAllByText(/^Detail for /)).toHaveLength(2);
  });

  it("names a removed product for staff", async () => {
    const jobs = await openFailed("staff");

    expect(jobs.getByText("Removed product · 2 pieces")).toBeInTheDocument();
    expect(jobs.getByText("Bangle · 12 pieces")).toBeInTheDocument();
  });

  it("names a removed product's job for a partner", async () => {
    const jobs = await openFailed("partner");

    expect(jobs.getByText("Job · 2 pieces")).toBeInTheDocument();
    expect(jobs.queryByText(/^Removed product/)).not.toBeInTheDocument();
  });

  it("never shows a partner the provider's words or the order", async () => {
    await openFailed("partner");

    expect(screen.getByText("Failed. Owed to you again")).toBeInTheDocument();
    expect(screen.queryByText(/The payment provider said/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The bank account was closed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Order #/)).not.toBeInTheDocument();
  });
});
