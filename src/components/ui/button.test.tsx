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
});
