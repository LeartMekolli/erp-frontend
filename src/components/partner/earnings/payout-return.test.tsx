import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetArrivalNotes } from "@/lib/navigation/arrival-note";

import { takeArrivalNote } from "../../../../test/arrival-note";
import { NORTHCAST_ID } from "../../../../test/fake-erp-api/seed";

import { PayoutReturn } from "./payout-return";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const EARNINGS = `/partner-portal/${NORTHCAST_ID}/earnings`;

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
});
afterEach(() => resetArrivalNotes());

describe("PayoutReturn", () => {
  it("hands how setup ended to Earnings and opens its plain address", async () => {
    navigation.search = "onboarding=done";
    render(<PayoutReturn partnerId={NORTHCAST_ID} />);
    expect(screen.getByRole("status")).toHaveTextContent("Opening Earnings…");
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(EARNINGS));
    expect(takeArrivalNote(EARNINGS)).toEqual({ onboarding: "done" });
  });

  it("passes on a link that ran out", async () => {
    navigation.search = "onboarding=expired";
    render(<PayoutReturn partnerId={NORTHCAST_ID} />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(EARNINGS));
    expect(takeArrivalNote(EARNINGS)).toEqual({ onboarding: "expired" });
  });

  it("opens Earnings with no note for an answer it doesn't know", async () => {
    navigation.search = "onboarding=junk";
    render(<PayoutReturn partnerId={NORTHCAST_ID} />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(EARNINGS));
    expect(takeArrivalNote(EARNINGS)).toBeNull();
  });

  it("opens Earnings with no note when there's no answer at all", async () => {
    render(<PayoutReturn partnerId={NORTHCAST_ID} />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(EARNINGS));
    expect(takeArrivalNote(EARNINGS)).toBeNull();
  });
});
