import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_NOTE_COOKIE, clearAuthNote, parseAuthNote } from "@/lib/auth/auth-note";
import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";
import { OfflineError, SessionEndedError, clientSession } from "@/lib/session/client-session";
import {
  FAKE_PASSWORD,
  LAYERLINE_ID,
  NORTHCAST_ID,
  PARTNER,
  STAFF,
  WORKSPACE,
} from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";

import { SessionGate } from "./session-gate";

class NotFoundSignal extends Error {}

const replace = vi.fn();
let params: { partnerId?: string } = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace }),
  useParams: () => params,
  notFound: () => {
    throw new NotFoundSignal();
  },
}));

/** Stands in for Next's not-found boundary. */
class NotFoundBoundary extends Component<{ children: ReactNode }, { notFound: boolean }> {
  state = { notFound: false };
  static getDerivedStateFromError(error: unknown) {
    if (error instanceof NotFoundSignal) return { notFound: true };
    throw error;
  }
  render() {
    return this.state.notFound ? <p>Not found</p> : this.props.children;
  }
}

function signInAs(email: string): string {
  const tokens = fakeState().login(WORKSPACE, email, FAKE_PASSWORD);
  if (!("access_token" in tokens)) throw new Error("fake sign-in failed");
  return tokens.access_token;
}

const getAccessToken = vi.fn<(options?: { force?: boolean }) => Promise<string>>();
const signOut = vi.fn<(reason?: string, options?: { quiet?: boolean }) => Promise<void>>();

function renderGate(area: "staff" | "partner") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotFoundBoundary>
        <SessionGate area={area}>
          <p>Area content</p>
        </SessionGate>
      </NotFoundBoundary>
    </QueryClientProvider>,
  );
}

const setHint = (value: string | null) => {
  document.cookie = value
    ? `${WORKSPACE_HINT_COOKIE}=${value}; path=/`
    : `${WORKSPACE_HINT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

beforeEach(() => {
  replace.mockReset();
  params = {};
  window.history.replaceState(null, "", "/orders/1?tab=open");
  getAccessToken.mockReset();
  signOut.mockReset().mockResolvedValue(undefined);
  vi.spyOn(clientSession(), "getAccessToken").mockImplementation(getAccessToken);
  vi.spyOn(clientSession(), "signOut").mockImplementation(signOut as never);
});
const readAuthNote = () =>
  parseAuthNote(
    document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${AUTH_NOTE_COOKIE}=`))
      ?.slice(AUTH_NOTE_COOKIE.length + 1),
  );

afterEach(() => {
  vi.restoreAllMocks();
  setHint(null);
  clearAuthNote();
  window.history.replaceState(null, "", "/");
});

describe("SessionGate", () => {
  it("shows a quiet loading state while the session is restored", () => {
    getAccessToken.mockReturnValue(new Promise(() => {}));
    renderGate("staff");
    expect(screen.getByRole("status")).toHaveTextContent("Loading AMI…");
    expect(screen.queryByText("Area content")).not.toBeInTheDocument();
  });

  it("lets staff into the staff area", async () => {
    getAccessToken.mockResolvedValue(signInAs(STAFF.email));
    renderGate("staff");
    expect(await screen.findByText("Area content")).toBeInTheDocument();
  });

  it("keeps staff out of the partner portal", async () => {
    getAccessToken.mockResolvedValue(signInAs(STAFF.email));
    renderGate("partner");
    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("keeps a partner out of the staff area", async () => {
    getAccessToken.mockResolvedValue(signInAs(PARTNER.email));
    renderGate("staff");
    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("lets a partner into their own workshop and the chooser", async () => {
    getAccessToken.mockResolvedValue(signInAs(PARTNER.email));
    params = { partnerId: NORTHCAST_ID };
    const { unmount } = renderGate("partner");
    expect(await screen.findByText("Area content")).toBeInTheDocument();
    unmount();
    params = {};
    renderGate("partner");
    expect(await screen.findByText("Area content")).toBeInTheDocument();
  });

  it("keeps a partner out of another workshop", async () => {
    getAccessToken.mockResolvedValue(signInAs(PARTNER.email));
    params = { partnerId: LAYERLINE_ID };
    renderGate("partner");
    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("sends someone with no session to sign in, coming back to this page after", async () => {
    getAccessToken.mockRejectedValue(new SessionEndedError("none"));
    renderGate("staff");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    // The way back travels in the auth note, its query too (the payment provider's `?onboarding=`).
    expect(readAuthNote()).toEqual({ next: "/orders/1?tab=open" });
    expect(screen.queryByText("Area content")).not.toBeInTheDocument();
  });

  it("leaves a sign-out with a reason to the session provider", async () => {
    getAccessToken.mockRejectedValue(new SessionEndedError("idle"));
    renderGate("staff");
    await waitFor(() => expect(getAccessToken).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Area content")).not.toBeInTheDocument();
  });

  it("offers to try again when the server can't be reached, never signing out", async () => {
    getAccessToken.mockRejectedValueOnce(new OfflineError()).mockResolvedValue(signInAs(STAFF.email));
    renderGate("staff");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AMI can't reach the server right now. Try again in a moment.",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Area content")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out and goes to sign-in when a link was for another workspace", async () => {
    setHint("sandbox");
    getAccessToken.mockResolvedValue(signInAs(STAFF.email));
    renderGate("staff");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(readAuthNote()).toEqual({ workspace: "sandbox", next: "/orders/1?tab=open" });
    expect(signOut).toHaveBeenCalledWith("signed-out", { quiet: true });
    expect(screen.queryByText("Area content")).not.toBeInTheDocument();
  });

  it("stays signed in when the remembered workspace is the session's", async () => {
    setHint(WORKSPACE);
    getAccessToken.mockResolvedValue(signInAs(STAFF.email));
    renderGate("staff");
    expect(await screen.findByText("Area content")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});
