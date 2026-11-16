import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, NORTHCAST_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs, WithMe } from "../../../test/render";

import { SetupLink } from "./setup-link";

/** The link the fake provider hands out for Northcast. */
const LINK = `${FAKE_API_URL}/fake-provider/onboarding?partner=${NORTHCAST_ID}`;

/** Puts a clipboard in place of user-event's own, which `userEvent.setup()` attaches first. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}
afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

function renderLink() {
  return renderAs(
    STAFF,
    <WithMe>
      <SetupLink partnerId={NORTHCAST_ID} account="not_connected" />
    </WithMe>,
  );
}

describe("SetupLink", () => {
  it("copies a setup link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    stubClipboard(writeText);
    renderLink();

    await user.click(await screen.findByRole("button", { name: "Copy setup link" }));

    expect(await screen.findByText(/^Link copied\. It works once, until \d{2}:\d{2}\. Send it to the partner's owner\.$/)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it("shows the link when copying is refused", async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")));
    renderLink();

    await user.click(await screen.findByRole("button", { name: "Copy setup link" }));

    const field = await screen.findByRole("textbox", { name: "Setup link" });
    expect(field).toHaveValue(LINK);
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveAccessibleDescription(/^Copy it by hand\. It works once, until \d{2}:\d{2}\.$/);
  });

  it("says when payments aren't set up", async () => {
    const user = userEvent.setup();
    fakeState().earnings.linkUnavailable(NORTHCAST_ID);
    renderLink();

    await user.click(await screen.findByRole("button", { name: "Copy setup link" }));

    expect(await screen.findByText("Payments aren't set up for this workspace yet.")).toBeInTheDocument();
  });
});
