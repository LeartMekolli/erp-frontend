import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";

import { RING_BAND_JOB_ID, RING_OFFER_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { JobPage } from "./job-page";
import { PartnerNoticeProvider } from "./notice";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), groupId: "", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/jobs/${navigation.groupId}`,
  useParams: () => ({ partnerId: NORTHCAST_ID, groupId: navigation.groupId }),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.groupId = RING_BAND_JOB_ID;
  navigation.search = "";
});
afterEach(() => {
  server.events.removeAllListeners();
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

/** Ring band's piece with this label, as the fake holds it. */
function pieceOf(label: string) {
  const detail = fakeState().partnerJobs.detail(NORTHCAST_ID, RING_BAND_JOB_ID);
  if (!detail.ok) throw new Error("expected Ring band");
  const piece = detail.body.work_orders.find((one) => one.label === label);
  if (!piece) throw new Error(`expected ${label}`);
  return piece;
}

/** Passes a piece at Finish behind the page's back, as someone else at the workshop might. */
function passElsewhere(label: string) {
  fakeState().partnerJobs.move(
    NORTHCAST_ID,
    { kind: "pass", work_order_ids: [pieceOf(label).id], at_step: "finish", answers: [{ item: "surface_smooth", value: true }], photo_file_version_ids: ["f1f1f1f1-0000-4000-8000-000000000001"] },
    null,
    { id: PARTNER.id, name: PARTNER.name },
  );
}

const tick = async (name: string) => userEvent.click(await screen.findByRole("checkbox", { name }));

async function openFromBar(name: "Pass" | "Fail…") {
  const bar = await screen.findByRole("region", { name: "Selected pieces" });
  const button = within(bar).getByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
}

/** Answers Finish's checklist and adds the photo it asks for. */
async function fillPass(dialog: HTMLElement) {
  await userEvent.click(within(within(dialog).getByRole("group", { name: "Surface smooth" })).getByRole("radio", { name: "Yes" }));
  await userEvent.upload(within(dialog).getByLabelText("Photos"), new File(["x"], "photo.jpg", { type: "image/jpeg" }));
  await within(dialog).findByRole("button", { name: "Remove photo.jpg" }, { timeout: 4_000 });
}

/** The Pieces tab's panel. */
const piecesPanel = () => screen.findByRole("tabpanel", { name: "Pieces" });

/** The section a step's toggle opens and closes, by the step's name. */
async function sectionOf(name: string): Promise<{ toggle: HTMLElement; section: HTMLElement }> {
  const toggle = await within(await piecesPanel()).findByRole("button", { name: new RegExp(`^${name}\\b`) });
  return { toggle, section: toggle.closest("section")! };
}

describe("the partner's pieces list", () => {
  it("links a step's instructions from its heading and from the move dialog", async () => {
    renderPage();
    const { section } = await sectionOf("Finish");
    expect(within(section).getByRole("button", { name: "Instructions for Finish" })).toBeInTheDocument();

    await tick("Select 4/12");
    await openFromBar("Pass");
    const dialog = await screen.findByRole("dialog", { name: "Pass 1 piece at Finish" });
    expect(within(dialog).getByRole("button", { name: "Instructions for Finish" })).toBeInTheDocument();
  });

  it("keeps focus and the result at the step after a move", async () => {
    renderPage();
    await tick("Select 4/12");
    await openFromBar("Pass");
    const dialog = await screen.findByRole("dialog", { name: "Pass 1 piece at Finish" });
    await fillPass(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const { toggle, section } = await sectionOf("Finish");
    await waitFor(() => expect(toggle).toHaveFocus());
    const result = within(section).getByText("1 piece passed at Finish.");
    expect(result.closest("[data-tone]")).toHaveAttribute("data-tone", "success");
  });

  it("moves focus to the next step when a move empties one", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select all at Finish" }));
    await openFromBar("Pass");
    const dialog = await screen.findByRole("dialog", { name: /^Pass \d+ pieces at Finish$/ });
    await fillPass(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass" }));

    const panel = await piecesPanel();
    await waitFor(() => expect(within(panel).queryByRole("button", { name: /^Finish\b/ })).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(within(panel).getByText(/pieces passed at Finish\./)).toBeInTheDocument();
  });

  it("marks a scrapped piece as lost, apart from one being redone", async () => {
    renderPage();
    const { toggle, section } = await sectionOf("Scrapped");
    await userEvent.click(toggle);
    await within(section).findByRole("listitem");
    const mark = section.querySelector("li [data-look='lost']");
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent("Scrapped");
    expect(mark).toHaveClass("text-lost-ink");
    expect(mark!.querySelector("svg")).not.toBeNull();
  });
});

describe("moving pieces on the Job page", () => {
  it("passes a piece with its checklist and a photo", async () => {
    renderPage();
    await tick("Select 4/12");
    await openFromBar("Pass");
    const dialog = await screen.findByRole("dialog", { name: "Pass 1 piece at Finish" });
    await fillPass(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass" }));

    expect(await screen.findByText("1 piece passed at Finish.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Your part done\b/ })).toHaveAccessibleName("Your part done 5"));
    expect(screen.queryByRole("checkbox", { name: "Select 4/12" })).not.toBeInTheDocument();
  });

  it("fails a piece back into rework", async () => {
    renderPage();
    await tick("Select 4/12");
    await openFromBar("Fail…");
    const dialog = await screen.findByRole("dialog", { name: "Fail 1 piece at Finish" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Defect"), "Scratch");
    await userEvent.click(within(dialog).getByRole("button", { name: "Fail" }));

    expect(await screen.findByText("1 piece failed at Finish.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select 4/12" }).closest("li")).toHaveTextContent("Being redone"));
  });

  it("doesn't offer pieces it doesn't hold", async () => {
    renderPage();
    expect(await screen.findByRole("checkbox", { name: "Select 4/12" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /^Not with you yet\b/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Your part done\b/ }));
    expect(await screen.findByRole("link", { name: "History of 1/12" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "History of 7/12" })).toBeInTheDocument();
    for (const label of ["1/12", "2/12", "7/12", "8/12", "9/12", "10/12"]) expect(screen.queryByRole("checkbox", { name: `Select ${label}` })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select all at Not with you yet" })).not.toBeInTheDocument();
    expect(screen.queryByText("Needs a skill you don't have")).not.toBeInTheDocument();
  });

  it("opens a piece's story", async () => {
    const id = pieceOf("3/12").id;
    const { unmount } = renderPage();
    expect(await screen.findByRole("link", { name: "History of 3/12" })).toHaveAttribute("href", `?piece=${id}`);
    unmount();

    // The link only changes the address; the page opens the panel from it.
    navigation.search = `piece=${id}`;
    renderPage();
    const panel = await screen.findByRole("dialog", { name: "Piece 3/12" });
    expect(within(panel).getByText("Being redone at Finish")).toBeInTheDocument();
    const moves = within(panel).getByRole("list", { name: "Moves" });
    expect(within(moves).getByText(/^Print passed/)).toBeInTheDocument();
    expect(within(moves).getByText("Final QC failed")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(navigation.replace).toHaveBeenCalledWith(`/partner-portal/${NORTHCAST_ID}/jobs/${RING_BAND_JOB_ID}`, { scroll: false });
  });

  it("drops a piece moved on elsewhere", async () => {
    renderPage();
    await tick("Select 4/12");
    await tick("Select 5/12");
    await openFromBar("Pass");
    const dialog = await screen.findByRole("dialog", { name: "Pass 2 pieces at Finish" });
    await fillPass(dialog);
    passElsewhere("4/12");
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass" }));

    expect(await screen.findByText("Some pieces cannot make this move")).toBeInTheDocument();
    expect(await screen.findByText("1 piece moved on and left your selection.")).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Pass 1 piece at Finish" })).toBeInTheDocument();
  });

  it("keeps the form when a move is refused", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/partner-portal/partners/:partnerId/moves`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "Some pieces would move at the workspace's own steps" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderPage();
    await tick("Select 4/12");
    await openFromBar("Pass");
    const dialog = await screen.findByRole("dialog", { name: "Pass 1 piece at Finish" });
    await fillPass(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass" }));

    expect(await within(dialog).findByText("Some pieces would move at the workspace's own steps")).toBeInTheDocument();
    expect(within(within(dialog).getByRole("group", { name: "Surface smooth" })).getByRole("radio", { name: "Yes" })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Remove photo.jpg" })).toBeInTheDocument();
    expect(screen.queryByText("1 piece passed at Finish.")).not.toBeInTheDocument();
  });

  it("asks for nothing erp-api would refuse on an offer", async () => {
    navigation.groupId = RING_OFFER_ID;
    const asked: string[] = [];
    server.events.on("request:start", ({ request }) => asked.push(new URL(request.url).pathname));
    renderPage();
    expect(await screen.findByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    const job = `/partner-portal/partners/${NORTHCAST_ID}/jobs/${RING_OFFER_ID}`;
    expect(asked).toContain(job);
    expect(asked.filter((path) => path.startsWith(`${job}/`))).toEqual([]);
  });
});
