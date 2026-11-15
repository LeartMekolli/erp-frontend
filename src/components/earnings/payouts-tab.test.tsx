import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { NORTHCAST_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs, WithMe } from "../../../test/render";
import { useStaffPartnerPayouts } from "@/lib/partners/queries";

import { PayoutsTab } from "./payouts-tab";

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
});
