import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, type JsonBodyType } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIGNED_OUT_COOKIE, clearSignedOut, markSignedOut } from "@/lib/auth/auth-note";
import { leaveArrivalNote, resetArrivalNotes } from "@/lib/navigation/arrival-note";
import { clientSession } from "@/lib/session/client-session";

import { takeArrivalNote } from "../../../test/arrival-note";
import { server } from "../../../test/msw";

import { SignIn, SignInForm } from "./sign-in-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));

const LOGIN_URL = `${window.location.origin}/session/login`;
const tokens = { accessToken: "a1", expiresAt: "2030-01-01T00:00:00.000Z", signedInAt: 1 };

let loginCalls = 0;
function answerLogin(status: number, body: Record<string, unknown>, delayMs = 0) {
  server.use(
    http.post(LOGIN_URL, async () => {
      loginCalls++;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return HttpResponse.json(body as JsonBodyType, { status });
    }),
  );
}

async function fillAndSubmit(user = userEvent.setup()) {
  await user.type(screen.getByLabelText("Workspace"), "demo");
  await user.type(screen.getByLabelText("Email"), "owner@demo.example.test");
  await user.type(screen.getByLabelText("Password"), "fake-password-1");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

const startSession = vi.fn();
beforeEach(() => {
  loginCalls = 0;
  push.mockReset();
  startSession.mockReset();
  vi.spyOn(clientSession(), "startSession").mockImplementation(startSession);
});
afterEach(() => {
  vi.restoreAllMocks();
  clearSignedOut();
  resetArrivalNotes();
});

const markedSignedOut = () => document.cookie.split("; ").includes(`${SIGNED_OUT_COOKIE}=1`);

describe("SignInForm", () => {
  it("has the fields in the agreed tab order", async () => {
    const user = userEvent.setup();
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByLabelText("Workspace")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveFocus();
  });

  it("starts empty with the agreed placeholder, or prefilled from the hint", () => {
    const { unmount } = render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    expect(screen.getByLabelText("Workspace")).toHaveValue("");
    expect(screen.getByLabelText("Workspace")).toHaveAttribute("placeholder", "your-workspace");
    unmount();
    render(<SignInForm initialWorkspace="demo" next={null} reason={null} />);
    expect(screen.getByLabelText("Workspace")).toHaveValue("demo");
  });

  it("signs in, starts the session and goes to the person's home", async () => {
    answerLogin(200, { ...tokens, destination: { kind: "staff", path: "/" } });
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(startSession).toHaveBeenCalledWith(tokens);
  });

  it("returns to a safe next page", async () => {
    answerLogin(200, { ...tokens, destination: { kind: "staff", path: "/" } });
    render(<SignInForm initialWorkspace="" next="/orders/1" reason={null} />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/1"));
  });

  it("ignores an unsafe next page", async () => {
    answerLogin(200, { ...tokens, destination: { kind: "partner", partnerId: "p1", path: "/partner-portal/p1" } });
    render(<SignInForm initialWorkspace="" next="//evil.example" reason={null} />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/partner-portal/p1"));
  });

  it.each([
    [401, { error: "invalid_credentials" }, "That workspace, email and password don't match. Check them and try again."],
    [429, { error: "too_many_attempts" }, "Too many attempts. Try again in 15 minutes."],
    [403, { error: "customer" }, "This account is for ordering. Use your supplier's customer site to sign in."],
    [403, { error: "no_access" }, "Your account has no access yet. Ask your workspace admin."],
    [502, { error: "api_unreachable" }, "AMI can't reach the server right now. Try again in a moment."],
  ])("shows the copy for a %i %j", async (status, body, copy) => {
    answerLogin(status, body);
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
    expect(push).not.toHaveBeenCalled();
  });

  it("says when the browser is offline", async () => {
    server.use(http.post(LOGIN_URL, () => HttpResponse.error()));
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("You're offline. Check your connection and try again.");
  });

  it("locks the form while signing in and sends one request for two clicks", async () => {
    answerLogin(200, { ...tokens, destination: { kind: "staff", path: "/" } }, 50);
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    const user = await fillAndSubmit();
    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    await user.click(button);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(loginCalls).toBe(1);
  });

  it("asks for each empty field without calling the server", async () => {
    const user = userEvent.setup();
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your workspace.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace")).toHaveAttribute("aria-invalid", "true");
    expect(loginCalls).toBe(0);
  });

  it.each([
    ["idle", "You were signed out after 3 hours without activity."],
    ["expired", "You were signed out because your session reached 12 hours. Sign in again to continue."],
    ["revoked", "Your session ended. Sign in again to continue."],
    ["signed-out", "You've signed out."],
  ])("explains a %s sign-out", (reason, copy) => {
    render(<SignInForm initialWorkspace="" next={null} reason={reason} />);
    expect(screen.getByRole("status")).toHaveTextContent(copy);
  });

  it("links to the plain password reset page, handing it the workspace out of sight", async () => {
    const user = userEvent.setup();
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    await user.type(screen.getByLabelText("Workspace"), "demo");
    const link = screen.getByRole("link", { name: "Forgot password?" });
    expect(link).toHaveAttribute("href", "/forgot-password");
    await user.click(link);
    expect(takeArrivalNote("/forgot-password")).toEqual({ workspace: "demo" });
  });

  it("leaves no note for the reset page when the workspace is empty", async () => {
    const user = userEvent.setup();
    render(<SignInForm initialWorkspace="" next={null} reason={null} />);
    await user.click(screen.getByRole("link", { name: "Forgot password?" }));
    expect(takeArrivalNote("/forgot-password")).toBeNull();
  });

  it("clears the signed-out mark once signed in", async () => {
    markSignedOut();
    answerLogin(200, { ...tokens, destination: { kind: "staff", path: "/" } });
    render(<SignInForm initialWorkspace="" next="/orders/1" reason="idle" />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/1"));
    expect(markedSignedOut()).toBe(false);
  });
});

describe("SignIn", () => {
  it("shows why this tab was signed out and goes back where it was, from the note it was left", async () => {
    leaveArrivalNote("/sign-in", { reason: "idle", next: "/orders/1", workspace: "sandbox" });
    answerLogin(200, { ...tokens, destination: { kind: "staff", path: "/" } });
    render(<SignIn lastWorkspace="demo" />);
    expect(screen.getByRole("status")).toHaveTextContent("You were signed out after 3 hours without activity.");
    expect(screen.getByLabelText("Workspace")).toHaveValue("sandbox");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "owner@demo.example.test");
    await user.type(screen.getByLabelText("Password"), "fake-password-1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/1"));
  });

  it("uses the note once: opening the page again shows no message", () => {
    leaveArrivalNote("/sign-in", { reason: "signed-out" });
    const { unmount } = render(<SignIn lastWorkspace="" />);
    expect(screen.getByRole("status")).toHaveTextContent("You've signed out.");
    unmount();

    render(<SignIn lastWorkspace="demo" />);
    expect(screen.queryByText("You've signed out.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Workspace")).toHaveValue("demo");
  });

  it("ignores a note left for another page", () => {
    leaveArrivalNote("/forgot-password", { workspace: "sandbox" });
    render(<SignIn lastWorkspace="demo" />);
    expect(screen.getByLabelText("Workspace")).toHaveValue("demo");
  });
});
