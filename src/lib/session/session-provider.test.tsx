import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_NOTE_COOKIE, clearAuthNote, parseAuthNote } from "@/lib/auth/auth-note";

import { clientSession, type SignOutReason } from "./client-session";
import { SessionProvider } from "./session-provider";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace }),
  usePathname: () => window.location.pathname,
}));

const readAuthNote = () =>
  parseAuthNote(
    document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${AUTH_NOTE_COOKIE}=`))
      ?.slice(AUTH_NOTE_COOKIE.length + 1),
  );

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
  clearAuthNote();
  window.history.replaceState(null, "", "/");
});

describe("SessionProvider", () => {
  it("goes to plain /sign-in with the reason and the way back in the auth note", () => {
    render(<SessionProvider>page</SessionProvider>);
    act(() => ended?.("idle"));
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(readAuthNote()).toEqual({ reason: "idle", next: "/orders/1" });
  });

  it("after a deliberate sign-out, keeps no way back", () => {
    render(<SessionProvider>page</SessionProvider>);
    act(() => ended?.("signed-out"));
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(readAuthNote()).toEqual({ reason: "signed-out" });
  });
});
