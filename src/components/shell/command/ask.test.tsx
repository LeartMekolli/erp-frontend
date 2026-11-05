import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CLERK, STAFF, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { renderAs } from "../../../../test/render";

import { CommandBox } from "./command-box";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/orders" }));

const SLOW = { timeout: 3_000 };

async function openBox(user: FakeUser = STAFF) {
  renderAs(user, <CommandBox />);
  await userEvent.click(await screen.findByRole("button", { name: /^Search/ }));
  const box = await screen.findByRole("dialog", { name: "Search" });
  return { box, input: within(box).getByPlaceholderText("Search or ask a question") };
}

describe("Ask AI in ⌘K", () => {
  it("offers Ask AI as the last row to staff who may use it", async () => {
    const { box, input } = await openBox();
    await userEvent.type(input, "late orders");
    expect(await within(box).findByRole("option", { name: 'Ask AI: "late orders"' })).toBeInTheDocument();
  });

  it("hides Ask AI without ai.use", async () => {
    const { box, input } = await openBox(CLERK);
    await userEvent.type(input, "1041");
    await within(box).findByRole("option", { name: /#1041/ });
    expect(within(box).queryByRole("option", { name: /Ask AI/ })).not.toBeInTheDocument();
  });

  it("asks, shows Thinking, then the answer with links", async () => {
    const { box, input } = await openBox();
    await userEvent.type(input, "Why is 1041 late?");
    await userEvent.click(await within(box).findByRole("option", { name: /Ask AI/ }));

    expect(await within(box).findByRole("status")).toHaveTextContent("Thinking…");
    expect(within(box).getByText("Why is 1041 late?")).toBeInTheDocument();

    expect(await within(box).findByText(/3 pieces are back in finishing/, {}, SLOW)).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "#1041" })).toHaveAttribute(
      "href",
      "/orders/22222222-0000-4000-8000-000000001041",
    );
    expect(within(box).getByText("Finishing")).not.toHaveAttribute("href");
    expect(within(box).getByText(/Suggested: Contact the customer/)).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "Fieldnote Studio" })).toHaveAttribute(
      "href",
      "/customers/11111111-0000-4000-8000-000000000001",
    );
    expect(within(box).getByText("Each question is answered on its own.")).toBeInTheDocument();
  });

  it("asks with ⌘Enter", async () => {
    const { box, input } = await openBox();
    await userEvent.type(input, "Why is 1041 late?");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(await within(box).findByRole("status")).toHaveTextContent("Thinking…");
  });

  it("renders answer text as text", async () => {
    const { box, input } = await openBox();
    await userEvent.type(input, "show me html");
    await userEvent.click(await within(box).findByRole("option", { name: /Ask AI/ }));
    expect(await within(box).findByText("<b>Not bold</b>", {}, SLOW)).toBeInTheDocument();
    expect(box.querySelector("b")).toBeNull();
  });

  it("typing again goes back to search results", async () => {
    const { box, input } = await openBox();
    await userEvent.type(input, "Why is 1041 late?");
    await userEvent.click(await within(box).findByRole("option", { name: /Ask AI/ }));
    await within(box).findByText(/3 pieces are back in finishing/, {}, SLOW);
    await userEvent.clear(input);
    await userEvent.type(input, "1041");
    expect(await within(box).findByRole("option", { name: "#1041 · Fieldnote Studio" })).toBeInTheDocument();
    expect(within(box).queryByText(/3 pieces are back in finishing/)).not.toBeInTheDocument();
  });

  it("shows the reason on a 409", async () => {
    fakeState().ai.setAvailable(false);
    const { box, input } = await openBox();
    await userEvent.type(input, "late orders");
    await userEvent.click(await within(box).findByRole("option", { name: /Ask AI/ }));
    expect(await within(box).findByText("AI is not set up for this workspace")).toBeInTheDocument();
  });

  it("offers Ask again after a failed run", async () => {
    const { box, input } = await openBox();
    await userEvent.type(input, "please fail");
    await userEvent.click(await within(box).findByRole("option", { name: /Ask AI/ }));
    expect(await within(box).findByText("The AI couldn't answer this time.", {}, SLOW)).toBeInTheDocument();
    await userEvent.click(within(box).getByRole("button", { name: "Ask again" }));
    expect(await within(box).findByRole("status")).toHaveTextContent("Thinking…");
  });

  it("disables Ask AI past 500 characters", async () => {
    const { box, input } = await openBox();
    await userEvent.click(input);
    await userEvent.paste("a".repeat(501));
    const ask = await within(box).findByRole("option", { name: /Ask AI/ });
    expect(ask).toHaveAttribute("aria-disabled", "true");
    expect(within(box).getByText("Questions can be up to 500 characters.")).toBeInTheDocument();
  });
});
