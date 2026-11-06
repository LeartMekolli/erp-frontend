import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { createFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { StaffLanding } from "./staff-landing";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: replace }) }));

beforeEach(() => replace.mockReset());

describe("StaffLanding", () => {
  it("sends staff to Orders", async () => {
    renderAs(STAFF, <StaffLanding />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/orders"));
  });

  it("stays on a plain page when no section is open to them", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/me`, () => HttpResponse.json({ ...createFakeState().me(STAFF), permissions: ["file.read"] })),
    );
    renderAs(STAFF, <StaffLanding />);
    expect(await screen.findByRole("heading", { name: "Hello, Dana" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
