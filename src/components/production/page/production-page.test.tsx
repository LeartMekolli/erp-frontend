import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StepCounts } from "@/lib/api/schema-types";

import { FAKE_API_URL, NO_ACCESS, STAFF, WORKFLOW_READER } from "../../../../test/fake-erp-api/seed";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

import { ProductionPage } from "./production-page";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => "/production",
  notFound: navigation.notFound,
}));

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";
const CAST_ID = "b2b2b2b2-0000-4000-8000-000000000002";

let requests: URL[] = [];

beforeEach(() => {
  navigation.notFound.mockReset();
  requests = [];
  server.events.on("request:start", ({ request }) => requests.push(new URL(request.url)));
});
afterEach(() => server.events.removeAllListeners());

const sent = (path: string) => requests.filter((url) => url.pathname === path);
const tab = (name: RegExp) => screen.getByRole("tab", { name });
const lineLinks = () => screen.getAllByRole("link").filter((link) => /^#\d+$/.test(link.textContent ?? ""));

/** A second product type with more pieces in progress than the seed's. */
function addCastMetal() {
  const cast: StepCounts = {
    steps: [
      { key: "casting", name: "Casting", active: 40, in_rework: 0, workable: 40 },
      { key: "polishing", name: "Polishing", active: 50, in_rework: 0, workable: 50 },
    ],
  };
  server.use(
    http.get(`${FAKE_API_URL}/workflow/workflows`, () =>
      HttpResponse.json({
        data: [
          { id: WORKFLOW_ID, key: "standard", name: "Standard production", version: 1 },
          { id: CAST_ID, key: "cast_metal", name: "Cast metal parts", version: 1 },
        ],
      }),
    ),
    http.get(`${FAKE_API_URL}/workflow/work-orders/counts`, ({ request }) =>
      new URL(request.url).searchParams.get("workflow_id") === CAST_ID ? HttpResponse.json(cast) : undefined,
    ),
    http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, ({ request }) =>
      new URL(request.url).searchParams.get("workflow_id") === CAST_ID ? HttpResponse.json({ data: [], next_cursor: null }) : undefined,
    ),
  );
}

describe("ProductionPage", () => {
  it("is not found without workflow.read", async () => {
    renderAs(NO_ACCESS, <ProductionPage />);
    await vi.waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });

  it("opens on the busiest product type and step, with each step's count", async () => {
    renderAs(STAFF, <ProductionPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Production" })).toBeInTheDocument();
    await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("combobox", { name: "Product type" })).toHaveValue(WORKFLOW_ID);
    expect(screen.getAllByRole("tab").map((step) => step.textContent)).toEqual(["Print 26", "Finish 24", "Final QC 13", "Packing 1"]);
    expect(await screen.findByRole("link", { name: "#1045" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#1048" })).toBeInTheDocument();
  });

  it("moves between steps with the arrow keys", async () => {
    renderAs(STAFF, <ProductionPage />);
    await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
    act(() => tab(/^Print/).focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(tab(/^Finish/)).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(tab(/^Finish/)).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("link", { name: "#1041" })).toBeInTheDocument();
    await waitFor(() => expect(lineLinks().map((link) => link.textContent)).toEqual(["#1041", "#1048"]));
  });

  it("picks the step on a phone too", async () => {
    renderAs(STAFF, <ProductionPage />);
    const picker = await screen.findByRole("combobox", { name: "Step" });
    await waitFor(() => expect(picker).toHaveValue("print"));
    expect(within(picker).getByRole("option", { name: "Finish · 24" })).toBeInTheDocument();
    await userEvent.selectOptions(picker, "finish");
    expect(tab(/^Finish/)).toHaveAttribute("aria-selected", "true");
  });

  it("opens on the product type with the most pieces in progress, and a change picks that type's busiest step", async () => {
    addCastMetal();
    renderAs(STAFF, <ProductionPage />);
    const productType = await screen.findByRole("combobox", { name: "Product type" });
    await waitFor(() => expect(productType).toHaveValue(CAST_ID));
    expect(tab(/^Polishing/)).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Nothing waiting at Polishing.")).toBeInTheDocument();
    await userEvent.selectOptions(productType, WORKFLOW_ID);
    await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
    expect(await screen.findByRole("link", { name: "#1045" })).toBeInTheDocument();
  });

  it("searches the lines and the counts", async () => {
    renderAs(STAFF, <ProductionPage />);
    await screen.findByRole("link", { name: "#1045" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search order, product or customer" }), "1041");
    await waitFor(() => expect(screen.queryByRole("link", { name: "#1045" })).not.toBeInTheDocument());
    // While the search loads, the step tabs keep the latest counts rather than give way to a skeleton.
    expect(screen.getByRole("tablist", { name: "Steps" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "#1041" })).toBeInTheDocument();
    await waitFor(() => expect(tab(/^Print/)).toHaveTextContent("Print 10"));
    expect(tab(/^Finish/)).toHaveTextContent("Finish 20");
    expect(sent("/workflow/work-orders/counts").at(-1)?.searchParams.get("q")).toBe("1041");
    expect(sent("/workflow/work-orders/groups").at(-1)?.searchParams.get("q")).toBe("1041");
  });

  it("sorts the lines", async () => {
    renderAs(STAFF, <ProductionPage />);
    await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
    await userEvent.click(tab(/^Finish/));
    await waitFor(() => expect(lineLinks().map((link) => link.textContent)).toEqual(["#1041", "#1048"]));
    await userEvent.click(screen.getByRole("button", { name: "Sort: Due soonest" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Due latest" }));
    await waitFor(() => expect(lineLinks().map((link) => link.textContent)).toEqual(["#1048", "#1041"]));
    expect(sent("/workflow/work-orders/groups").at(-1)?.searchParams.get("sort")).toBe("-due_on");
  });

  it("asks for only what the person can work", async () => {
    renderAs(STAFF, <ProductionPage />);
    await screen.findByRole("link", { name: "#1045" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Only what I can work" }));
    await waitFor(() => expect(sent("/workflow/work-orders/groups").at(-1)?.searchParams.get("workable")).toBe("true"));
    expect(sent("/workflow/work-orders/counts").at(-1)?.searchParams.get("workable")).toBe("true");
  });

  it("offers no tick boxes and no Only what I can work without workflow.move", async () => {
    renderAs(WORKFLOW_READER, <ProductionPage />);
    await screen.findByRole("link", { name: "#1045" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says when no piece is in progress", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/counts`, () =>
        HttpResponse.json({
          steps: ["print", "finish", "final_qc", "packing"].map((key) => ({ key, name: key, active: 0, in_rework: 0, workable: 0 })),
        }),
      ),
    );
    renderAs(STAFF, <ProductionPage />);
    expect(await screen.findByText("No pieces in progress for Standard production.")).toBeInTheDocument();
    expect(sent("/workflow/work-orders/groups")).toHaveLength(0);
  });

  it("opens the default view again after a reload, at the same address", async () => {
    const first = renderAs(STAFF, <ProductionPage />);
    await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
    await userEvent.click(tab(/^Finish/));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search order, product or customer" }), "1041");
    first.unmount();
    renderAs(STAFF, <ProductionPage />);
    await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("searchbox", { name: "Search order, product or customer" })).toHaveValue("");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
