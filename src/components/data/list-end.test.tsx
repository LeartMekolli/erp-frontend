import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListEnd } from "./list-end";

function list(overrides: Partial<Parameters<typeof ListEnd>[0]["list"]> = {}) {
  return {
    hasNextPage: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    pageCount: 1,
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("ListEnd", () => {
  it("loads more from the button", async () => {
    const props = list();
    render(<ListEnd list={props} />);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("loads more when the end scrolls into view", () => {
    let fire: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          fire = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const props = list();
    render(<ListEnd list={props} />);
    fire([{ isIntersecting: true }]);
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("names the button when asked", () => {
    render(<ListEnd list={list()} more="Show earlier moves" />);
    expect(screen.getByRole("button", { name: "Show earlier moves" })).toBeInTheDocument();
  });

  it("waits for a click when auto is off", async () => {
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          fire = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const props = list();
    render(<ListEnd list={props} auto={false} />);
    expect(fire).toBeNull();
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows a busy button while loading", () => {
    render(<ListEnd list={list({ isFetchingNextPage: true })} />);
    const button = screen.getByRole("button", { name: "Loading more…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("shows \"That's everything.\" at the end", () => {
    render(<ListEnd list={list({ hasNextPage: false, pageCount: 2 })} />);
    expect(screen.getByText("That's everything.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says nothing at the end of a single page", () => {
    const { container } = render(<ListEnd list={list({ hasNextPage: false, pageCount: 1 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Try again after a failure", async () => {
    const props = list({ isFetchNextPageError: true });
    render(<ListEnd list={props} />);
    expect(screen.getByText("More couldn't be loaded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
