import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { leaveArrivalNote, resetArrivalNotes } from "@/lib/navigation/arrival-note";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import { ForgotPassword, ForgotPasswordForm } from "./forgot-password-form";

const RESET_URL = `${FAKE_API_URL}/auth/password-reset`;
const SENT = "If that email has an account in this workspace, a reset link is on its way.";

let sent: unknown[] = [];
beforeEach(() => {
  sent = [];
  // Records each request, then falls through to the fake erp-api.
  server.use(
    http.post(RESET_URL, async ({ request }) => {
      sent.push(await request.clone().json());
    }),
  );
});

async function fillAndSubmit(email: string, user = userEvent.setup()) {
  await user.type(screen.getByLabelText("Workspace"), "demo");
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
  return user;
}

describe("ForgotPassword", () => {
  afterEach(() => resetArrivalNotes());

  it("fills in the workspace typed on Sign in, once", () => {
    leaveArrivalNote("/forgot-password", { workspace: "sandbox" });
    const { unmount } = render(<ForgotPassword lastWorkspace="demo" />);
    expect(screen.getByLabelText("Workspace")).toHaveValue("sandbox");
    unmount();

    // A reload: the note is used, so it's the workspace this browser used last.
    render(<ForgotPassword lastWorkspace="demo" />);
    expect(screen.getByLabelText("Workspace")).toHaveValue("demo");
  });
});

describe("ForgotPasswordForm", () => {

  it("has the fields in tab order, then the back link", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm initialWorkspace="" />);
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByLabelText("Workspace")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Send reset link" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveFocus();
  });

  it("starts with the workspace it was given", () => {
    render(<ForgotPasswordForm initialWorkspace="demo" />);
    expect(screen.getByLabelText("Workspace")).toHaveValue("demo");
  });

  it("sends the workspace and email to erp-api", async () => {
    render(<ForgotPasswordForm initialWorkspace="" />);
    await fillAndSubmit(STAFF.email);
    await screen.findByText(SENT);
    expect(sent).toEqual([{ workspace: "demo", email: STAFF.email }]);
  });

  it.each([
    ["a known", STAFF.email],
    ["an unknown", "nobody@demo.example.test"],
  ])("shows the same message for %s email", async (_, email) => {
    render(<ForgotPasswordForm initialWorkspace="" />);
    await fillAndSubmit(email);
    expect(await screen.findByRole("status")).toHaveTextContent(SENT);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("says when there were too many requests", async () => {
    server.use(
      http.post(RESET_URL, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Too Many Requests", status: 429, detail: "Too many attempts" },
          { status: 429, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    render(<ForgotPasswordForm initialWorkspace="" />);
    await fillAndSubmit(STAFF.email);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in an hour.");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("says when erp-api can't be reached", async () => {
    server.use(http.post(RESET_URL, () => HttpResponse.error()));
    render(<ForgotPasswordForm initialWorkspace="" />);
    await fillAndSubmit(STAFF.email);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AMI can't reach the server right now. Try again in a moment.",
    );
  });

  it("locks the form while sending", async () => {
    server.use(
      http.post(RESET_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 202 });
      }),
    );
    render(<ForgotPasswordForm initialWorkspace="" />);
    await fillAndSubmit(STAFF.email);
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    await screen.findByText(SENT);
  });

  it("asks for each empty field without calling erp-api", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm initialWorkspace="" />);
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Enter your workspace.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(sent).toHaveLength(0));
  });
});
