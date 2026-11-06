import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders the primary button in ink with a visible focus ring class", () => {
    render(<Button>Sign in</Button>);
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button.className).toMatch(/bg-ink/);
    expect(button.className).toMatch(/focus-visible:/);
  });

  it("is at least 44px tall", () => {
    render(<Button>Sign in</Button>);
    expect(screen.getByRole("button").className).toMatch(/h-11|min-h-11/);
  });

  // shadcn's dialog, sheet and command use these.
  it("has a quiet ghost and an outline variant", () => {
    render(
      <>
        <Button variant="ghost">Close</Button>
        <Button variant="outline">Cancel</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Close" }).className).not.toMatch(/bg-ink/);
    expect(screen.getByRole("button", { name: "Cancel" }).className).toMatch(/border-line/);
  });

  it("has square icon sizes that stay 44px on touch screens", () => {
    render(
      <>
        <Button size="icon" aria-label="Menu" />
        <Button size="icon-sm" aria-label="Close" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Menu" }).className).toMatch(/size-11/);
    expect(screen.getByRole("button", { name: "Close" }).className).toMatch(/pointer-coarse:size-11/);
  });
});
