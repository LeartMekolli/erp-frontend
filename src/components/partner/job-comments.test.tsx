import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";

import { RING_BAND_JOB_ID } from "../../../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { JobPage } from "./job-page";
import { PartnerNoticeProvider } from "./notice";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/jobs/${RING_BAND_JOB_ID}`,
  useParams: () => ({ partnerId: NORTHCAST_ID, groupId: RING_BAND_JOB_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

beforeEach(() => {
  // An old link to the Comments tab: it opens Pieces, with the comments in the side column.
  navigation.search = "tab=comments";
});

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderPage() {
  return renderAs(
    PARTNER,
    <PartnerNoticeProvider>
      <WithMe>
        <JobPage />
      </WithMe>
    </PartnerNoticeProvider>,
  );
}

describe("comments on the Job page", () => {
  it("talks with staff", async () => {
    renderPage();
    expect(await screen.findByRole("tab", { name: "Pieces" })).toHaveAttribute("aria-selected", "true");
    const staffs = (await within(screen.getByRole("region", { name: "Comments" })).findByText("Matte polish on these, please.")).closest("li")!;
    expect(within(staffs).getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("Staff at Demo will read this.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Add a comment"), "Polished, packing tomorrow.");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));

    const mine = (await screen.findByText("Polished, packing tomorrow.")).closest("li")!;
    expect(within(mine).getByText(PARTNER.name)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Add a comment")).toHaveValue(""));
  });

  it("moves but can't comment while suspended", async () => {
    fakeState().suspendPartner(NORTHCAST_ID);
    const { unmount } = renderPage();
    expect(await screen.findByText("Matte polish on these, please.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    expect(screen.queryByText(/will read this\.$/)).not.toBeInTheDocument();
    unmount();

    navigation.search = "";
    renderPage();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select 4/12" }));
    const bar = await screen.findByRole("region", { name: "Selected pieces" });
    await waitFor(() => expect(within(bar).getByRole("button", { name: "Pass" })).toBeEnabled());
    await userEvent.click(within(bar).getByRole("button", { name: "Pass" }));
    const dialog = await screen.findByRole("dialog", { name: "Pass 1 piece at Finish" });
    await userEvent.click(within(within(dialog).getByRole("group", { name: "Surface smooth" })).getByRole("radio", { name: "Yes" }));
    await userEvent.upload(within(dialog).getByLabelText("Photos"), new File(["x"], "photo.jpg", { type: "image/jpeg" }));
    await within(dialog).findByRole("button", { name: "Remove photo.jpg" }, { timeout: 4_000 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass" }));
    expect(await screen.findByText("1 piece passed at Finish.")).toBeInTheDocument();
  });
});
