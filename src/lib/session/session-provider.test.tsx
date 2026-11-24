import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIGNED_OUT_COOKIE, clearSignedOut } from "@/lib/auth/auth-note";
import { resetArrivalNotes } from "@/lib/navigation/arrival-note";

import { takeArrivalNote } from "../../../test/arrival-note";

import { clientSession, type SignOutReason } from "./client-session";
import { SessionProvider } from "./session-provider";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace }),
  usePathname: () => window.location.pathname,
}));

const markedSignedOut = () => document.cookie.split("; ").includes(`${SIGNED_OUT_COOKIE}=1`);

let ended: ((reason: SignOutReason) => void) | null = null;

beforeEach(() => {
  replace.mockReset();
  ended = null;
  window.history.replaceState(null, "", "/orders/1");
  vi.spyOn(clientSession(), "watch").mockReturnValue(() => undefined);
  vi.spyOn(clientSession(), "recordActivity").mockImplementation(() => undefined);
  vi.spyOn(clientSession(), "onSessionEnded").mockImplementation((listener) => {
    ended = listener;
    return () => undefined;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  clearSignedOut();
  resetArrivalNotes();
  window.history.replaceState(null, "", "/");
});

describe("SessionProvider", () => {
  it("goes to plain /sign-in with the reason and the way back in this tab's note", () => {
    render(<SessionProvider>page</SessionProvider>);
    act(() => ended?.("idle"));
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(takeArrivalNote("/sign-in")).toEqual({ reason: "idle", next: "/orders/1" });
    // Shared by the tabs, and only says "just signed out", so the sign-in page doesn't send it home.
    expect(markedSignedOut()).toBe(true);
  });

  it("after a deliberate sign-out, keeps no way back", () => {
    render(<SessionProvider>page</SessionProvider>);
    act(() => ended?.("signed-out"));
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(takeArrivalNote("/sign-in")).toEqual({ reason: "signed-out" });
  });
});
