import { HttpResponse, type HttpHandler } from "msw";
import { createOpenApiHttp } from "openapi-msw";

import type { paths } from "../../src/lib/api/schema-types";
import { fakeState } from "./state";

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  429: "Too Many Requests",
};

/** erp-api's error body for a Nest exception (`api-error.ts:108-117`). */
function problem(status: number, detail: string) {
  return HttpResponse.json(
    { type: "about:blank", title: TITLES[status] ?? "Error", status, detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

/** erp-api's error body for a failed Zod check (`api-error.ts:95-104`). */
function validation(errors: { path: string; message: string }[]) {
  return HttpResponse.json(
    { type: "urn:problem:validation", title: "Validation failed", status: 400, errors },
    { status: 400, headers: { "content-type": "application/problem+json" } },
  );
}

/** The password rule from erp-api `src/modules/identity/passwords.ts:20`. */
function passwordErrors(password: unknown): { path: string; message: string }[] {
  if (typeof password !== "string" || password.length < 12)
    return [{ path: "password", message: "Too small: expected string to have >=12 characters" }];
  if (password.length > 128)
    return [{ path: "password", message: "Too big: expected string to have <=128 characters" }];
  return [];
}

function bearer(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
}

/**
 * Handlers for every erp-api route the foundation calls. Success bodies are
 * typed from erp-api's OpenAPI document, so a change there stops this compiling.
 * `baseUrl` is erp-api's address as the code under test calls it; the
 * standalone server passes "" so paths resolve against its own origin.
 */
export function createHandlers(baseUrl: string): HttpHandler[] {
  const http = createOpenApiHttp<paths>({ baseUrl });

  return [
    http.post("/auth/login", async ({ request, response }) => {
      const body = await request.json();
      const result = fakeState().login(body.workspace, body.email, body.password);
      if ("status" in result)
        return response.untyped(
          result.status === 429
            ? problem(429, "Too many attempts, try again later")
            : problem(401, "Invalid credentials"),
        );
      return response(200).json(result);
    }),

    http.post("/auth/refresh", async ({ request, response }) => {
      const body = await request.json();
      const result = fakeState().refresh(body.refresh_token);
      if ("status" in result) return response.untyped(problem(401, "Invalid refresh token"));
      return response(200).json(result);
    }),

    http.post("/auth/logout", async ({ request, response }) => {
      const body = await request.json();
      const result = fakeState().logout(bearer(request), body.refresh_token);
      if (result.status === 401) return response.untyped(problem(401, "Unauthorized"));
      return response(204).empty();
    }),

    http.post("/auth/invitations/accept", async ({ request, response }) => {
      const body = await request.json();
      const errors = passwordErrors(body.password);
      if (errors.length) return response.untyped(validation(errors));
      const result = fakeState().acceptStaffInvitation(body.token, body.name, body.password);
      if (result.status === 400) return response.untyped(problem(400, "Invitation is invalid or expired"));
      return response(204).empty();
    }),

    http.post("/auth/partner-invitations/accept", async ({ request, response }) => {
      const body = await request.json();
      if (body.password !== undefined) {
        const errors = passwordErrors(body.password);
        if (errors.length) return response.untyped(validation(errors));
      }
      const result = fakeState().acceptPartnerInvitation(body.token, body.name, body.password);
      if (result.status === 400) return response.untyped(problem(400, "Invitation is invalid or expired"));
      return response(204).empty();
    }),

    http.post("/auth/password-reset", ({ response }) => {
      fakeState().requestPasswordReset();
      return response(202).empty();
    }),

    http.post("/auth/password-reset/confirm", async ({ request, response }) => {
      const body = await request.json();
      const errors = passwordErrors(body.password);
      if (errors.length) return response.untyped(validation(errors));
      const result = fakeState().confirmPasswordReset(body.token, body.password);
      if (result.status === 400) return response.untyped(problem(400, "Reset link is invalid or expired"));
      return response(204).empty();
    }),

    http.get("/me", ({ request, response }) => {
      const user = fakeState().authenticate(bearer(request));
      if (!user) return response.untyped(problem(401, "Unauthorized"));
      return response(200).json(fakeState().me(user));
    }),

    http.get("/partner-portal/me", ({ request, response }) => {
      const user = fakeState().authenticate(bearer(request));
      if (!user) return response.untyped(problem(401, "Unauthorized"));
      const result = fakeState().partnerMe(user);
      if ("status" in result) return response.untyped(problem(403, "Forbidden"));
      return response(200).json(result);
    }),
  ];
}
