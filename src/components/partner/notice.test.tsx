import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { PartnerNoticeLine, PartnerNoticeProvider, usePartnerNotice } from "./notice";

function Say({ text, focus = false, tone }: { text: string; focus?: boolean; tone?: "plain" | "success" }) {
  const { announce } = usePartnerNotice();
  return <button onClick={() => announce(text, { focus, tone })}>{`Say ${text}`}</button>;
}

function renderLine(children: ReactNode) {
  render(
    <PartnerNoticeProvider>
      {children}
      <PartnerNoticeLine />
    </PartnerNoticeProvider>,
  );
  return screen.getByRole("status");
}

describe("PartnerNoticeLine", () => {
  it("is there while empty, so the first notice is read", () => {
    const line = renderLine(<Say text="Saved." />);
    expect(line).toBeEmptyDOMElement();
  });

  it("puts the same notice in again, so it's read again", async () => {
    const line = renderLine(<Say text="Saved." />);
    await userEvent.click(screen.getByRole("button", { name: "Say Saved." }));
    const first = line.firstChild;
    expect(line).toHaveTextContent("Saved.");

    await userEvent.click(screen.getByRole("button", { name: "Say Saved." }));
    expect(line).toHaveTextContent(/^Saved\.$/);
    expect(line.firstChild).not.toBe(first);
  });

  it("takes focus only when asked", async () => {
    const line = renderLine(
      <>
        <Say text="Saved." />
        <Say text="Gone." focus />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Say Saved." }));
    expect(screen.getByRole("button", { name: "Say Saved." })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Say Gone." }));
    expect(line).toHaveFocus();
  });

  it("shows a win as a band with a check", async () => {
    const line = renderLine(<Say text="Ring is yours." tone="success" focus />);
    await userEvent.click(screen.getByRole("button", { name: "Say Ring is yours." }));

    const band = within(line).getByText("Ring is yours.").closest("[data-tone]");
    expect(band).toHaveAttribute("data-tone", "success");
    expect(band).toHaveClass("bg-lilac", "text-violet-ink");
    expect(band!.querySelector("svg")).not.toBeNull();
    expect(line).toHaveFocus();
  });

  it("keeps a plain notice plain", async () => {
    const line = renderLine(<Say text="You declined Ring." />);
    await userEvent.click(screen.getByRole("button", { name: "Say You declined Ring." }));

    expect(line).toHaveTextContent("You declined Ring.");
    expect(line.querySelector("[data-tone='success']")).toBeNull();
    expect(line.querySelector("svg")).toBeNull();
  });
});
