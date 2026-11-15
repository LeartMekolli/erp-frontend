import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NORTHCAST_ID } from "../../../test/fake-erp-api/seed";

import { PartnerSectionPage } from "./section-page";

// The real notFound throws to Next's boundary; here it only records the call.
const navigation = vi.hoisted(() => ({ section: "", notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ partnerId: NORTHCAST_ID, section: navigation.section }),
  notFound: navigation.notFound,
}));

beforeEach(() => {
  navigation.section = "";
  navigation.notFound.mockReset();
});

describe("PartnerSectionPage", () => {
  it("shows a section not built yet as coming soon", () => {
    navigation.section = "performance";
    render(<PartnerSectionPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Performance" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Jobs" })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs`);
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("doesn't find an unknown section", () => {
    navigation.section = "nowhere";
    render(<PartnerSectionPage />);
    expect(navigation.notFound).toHaveBeenCalled();
  });

  // Jobs has its own pages: an address deeper than a Job page lands here.
  it("doesn't find an address under Jobs", () => {
    navigation.section = "jobs";
    render(<PartnerSectionPage />);
    expect(navigation.notFound).toHaveBeenCalled();
  });
});
