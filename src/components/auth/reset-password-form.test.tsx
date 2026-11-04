import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FAKE_API_URL, RESET_TOKEN, USED_TOKEN } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import { ResetPasswordForm } from "./reset-password-form";

const CONFIRM_URL = `${FAKE_API_URL}/auth/password-reset/confirm`;
const NEW_PASSWORD = "a-new-password-1";
const EXPIRED = "This link has expired or was already used. Ask for a new one.";

const openLink = (token: string | null) =>
  window.history.replaceState(null, "", token ? `/reset-password#token=${encodeURIComponent(token)}` : "/reset-password");

let sent: unknown[] = [];
beforeEach(() => {
  sent = [];
  // Records each request, then falls through to the fake erp-api.
  server.use(
    http.post(CONFIRM_URL, async ({ request }) => {
      sent.push(await request.clone().json());
    }),
  );
});
afterEach(() => window.history.replaceState(null, "", "/"));

async function setPassword(password: string, user = userEvent.setup()) {
  await user.type(screen.getByLabelText("New password"), password);
  await user.click(screen.getByRole("button", { name: "Set password" }));
  return user;
}

describe("ResetPasswordForm", () => {
  it("removes the token from the address before anything is sent", () => {
    openLink(RESET_TOKEN);
    render(<ResetPasswordForm />);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/reset-password");
    expect(sent).toHaveLength(0);
  });

  it("asks for a new password with its rule", () => {
    openLink(RESET_TOKEN);
    render(<ResetPasswordForm />);
    expect(screen.getByRole("heading", { level: 1, name: "Set a new password" })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription("At least 12 characters.");
  });

  it("sets the password with the link's token and points to sign-in", async () => {
    openLink(RESET_TOKEN);
    render(<ResetPasswordForm />);
    await setPassword(NEW_PASSWORD);
    expect(await screen.findByRole("status")).toHaveTextContent("Your password is set. Sign in with it now.");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(sent).toEqual([{ token: RESET_TOKEN, password: NEW_PASSWORD }]);
  });

  it("explains a used link and offers a new one", async () => {
    openLink(USED_TOKEN);
    render(<ResetPasswordForm />);
    await setPassword(NEW_PASSWORD);
    expect(await screen.findByRole("alert")).toHaveTextContent(EXPIRED);
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("explains a link with no token at once, without a form", () => {
    openLink(null);
    render(<ResetPasswordForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(EXPIRED);
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("rejects a password under 12 characters without calling erp-api", async () => {
    openLink(RESET_TOKEN);
    render(<ResetPasswordForm />);
    await setPassword("too-short");
    expect(await screen.findByText("Use at least 12 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(sent).toHaveLength(0));
  });

  it("puts erp-api's password error on the field and keeps the form", async () => {
    server.use(
      http.post(CONFIRM_URL, () =>
        HttpResponse.json(
          {
            type: "urn:problem:validation",
            title: "Validation failed",
            status: 400,
            errors: [{ path: "password", message: "Too big: expected string to have <=128 characters" }],
          },
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    openLink(RESET_TOKEN);
    render(<ResetPasswordForm />);
    await setPassword(NEW_PASSWORD);
    expect(await screen.findByText("Too big: expected string to have <=128 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when erp-api can't be reached, and keeps the form", async () => {
    server.use(http.post(CONFIRM_URL, () => HttpResponse.error()));
    openLink(RESET_TOKEN);
    render(<ResetPasswordForm />);
    await setPassword(NEW_PASSWORD);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AMI can't reach the server right now. Try again in a moment.",
    );
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("locks the form while saving", async () => {
    server.use(
      http.post(CONFIRM_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    openLink(RESET_TOKEN);
    render(<ResetPasswordForm />);
    await setPassword(NEW_PASSWORD);
    expect(await screen.findByRole("button", { name: "Setting password…" })).toBeDisabled();
    expect(screen.getByLabelText("New password")).toBeDisabled();
    await screen.findByRole("status");
  });
});
