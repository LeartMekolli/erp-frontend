import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LAYERLINE_ID, LAYERLINE_OWNER, NORTHCAST_ID, NORTHCAST_MEMBER, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { renderAs, WithMe } from "../../../../test/render";

import { RatingsTile } from "./ratings-tile";
import { SCORE_PARTS, ScoreTile } from "./score-tile";

const navigation = vi.hoisted(() => ({ partnerId: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/dashboard`,
  useParams: () => ({ partnerId: navigation.partnerId }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
  navigation.partnerId = NORTHCAST_ID;
});

function renderScore(user: FakeUser = NORTHCAST_MEMBER) {
  return renderAs(
    user,
    <WithMe>
      <ScoreTile />
      <RatingsTile />
    </WithMe>,
  );
}

const meter = (tile: HTMLElement, label: string) => within(within(tile).getByRole("list", { name: /parts of your score/i })).getByText(label).closest("li")!;

describe("SCORE_PARTS", () => {
  it("lists the six parts in erp-api's order", () => {
    expect(SCORE_PARTS.map((part) => part.label)).toEqual(["Quality", "Scrap", "Reliability", "On time", "Rating", "Claims"]);
  });
});

describe("ScoreTile", () => {
  it("shows the score out of 5 and marks the lowest part in words", async () => {
    renderScore();
    const tile = await screen.findByRole("region", { name: "Your score" });
    expect(await within(tile).findByRole("img", { name: "Score 4.4 out of 5" })).toBeInTheDocument();
    expect(tile).toHaveTextContent("how staff see you");
    expect(meter(tile, "Quality")).toHaveTextContent("96%");
    expect(meter(tile, "On time")).toHaveTextContent("81%");
    expect(meter(tile, "On time")).toHaveTextContent("▲ lowest");
    expect(within(tile).getAllByText(/▲ lowest/)).toHaveLength(1);
  });

  it("says a new workshop's score comes after 5 finished jobs, and never shows 0% for a part it can't judge", async () => {
    navigation.partnerId = LAYERLINE_ID;
    renderScore(LAYERLINE_OWNER);
    const tile = await screen.findByRole("region", { name: "Your score" });
    expect(await within(tile).findByText("New: a score shows after 5 finished jobs (2 so far).")).toBeInTheDocument();
    expect(within(tile).getByRole("img", { name: "No score yet" })).toBeInTheDocument();
    expect(meter(tile, "On time")).toHaveTextContent("Not enough yet");
    expect(meter(tile, "Quality")).toHaveTextContent("100%");
    expect(within(tile).queryByText("0%")).toBeNull();
    expect(tile).not.toHaveTextContent("lowest");
  });
});

describe("RatingsTile", () => {
  it("counts the latest ratings by stars and shows the newest comment staff shared", async () => {
    renderScore();
    const tile = await screen.findByRole("region", { name: "Ratings" });
    expect(await within(tile).findByText("latest 50")).toBeInTheDocument();
    const bars = within(tile).getByRole("list", { name: /ratings by stars/i });
    expect(within(bars).getAllByRole("listitem").map((row) => row.textContent)).toEqual(["5 stars25", "4 stars15", "3 stars5", "2 stars5", "1 star0"]);
    expect(within(tile).getByText("Clean casting, the polish was even all round.")).toBeInTheDocument();
    expect(within(tile).getByLabelText("4 of 5")).toHaveTextContent("★★★★☆");
  });

  it("says when there are no ratings yet", async () => {
    navigation.partnerId = LAYERLINE_ID;
    renderScore(LAYERLINE_OWNER);
    const tile = await screen.findByRole("region", { name: "Ratings" });
    expect(await within(tile).findByText("No ratings yet.")).toBeInTheDocument();
  });
});
