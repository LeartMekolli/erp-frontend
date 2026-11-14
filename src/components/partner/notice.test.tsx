import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { PartnerNoticeLine, PartnerNoticeProvider, usePartnerNotice } from "./notice";

function Say({ text, focus = false }: { text: string; focus?: boolean }) {
  const { announce } = usePartnerNotice();
  return <button onClick={() => announce(text, { focus })}>{`Say ${text}`}</button>;
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
});
