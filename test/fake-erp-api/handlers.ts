import { HttpResponse, http as rawHttp, type HttpHandler } from "msw";
import { createOpenApiHttp } from "openapi-msw";

import type { paths, Permission } from "../../src/lib/api/schema-types";
import type { Answer } from "./orders";
import type { FakeUser } from "./seed";
import { fakeState } from "./state";

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  429: "Too Many Requests",
  503: "Service Unavailable",
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

/** The photo types a partner may upload (erp-api `files.controller.ts:31`). */
const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Who may call a file route: staff on `/files`, a person acting for that
 * workshop on its partner routes; anyone else is told the file isn't there.
 */
function fileCaller(request: Request, partnerId?: string): 200 | 401 | 404 {
  const user = fakeState().authenticate(bearer(request));
  if (!user) return 401;
  const allowed =
    partnerId === undefined ? user.kind === "staff" : user.kind === "partner" && user.organisations.includes(partnerId);
  return allowed ? 200 : 404;
}

function refused(status: 401 | 404) {
  return status === 401 ? problem(401, "Unauthorized") : problem(404, "File not found");
}

/** Staff holding `permission`, or the problem erp-api answers anyone else with. */
function staffWith(request: Request, permission: Permission): FakeUser | Response {
  const user = fakeState().authenticate(bearer(request));
  if (!user) return problem(401, "Unauthorized");
  if (user.kind !== "staff" || !user.permissions.includes(permission)) return problem(403, "Forbidden");
  return user;
}

/** A store's refusal as erp-api would send it. */
function refusal(answer: Exclude<Answer<unknown>, { ok: true }>): Response {
  return answer.status === 400 ? validation(answer.errors) : problem(answer.status, answer.detail);
}

/** The bucket's CORS rules: browsers may PUT with `content-type` (erp-api `README.md`, "File storage"). */
const STORAGE_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "PUT",
  "access-control-allow-headers": "content-type",
};

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
      if (result.status === 409) return response.untyped(problem(409, "A user with this email already exists"));
      return response(204).empty();
    }),

    http.post("/auth/invitations/preview", async ({ request, response }) => {
      const body = await request.json();
      const result = fakeState().previewInvitation(body.token);
      if (!("kind" in result)) return response.untyped(problem(404, "Invitation not found"));
      return response(200).json(result);
    }),

    http.post("/auth/partner-invitations/accept", async ({ request, response }) => {
      const body = await request.json();
      if (body.password !== undefined) {
        const errors = passwordErrors(body.password);
        if (errors.length) return response.untyped(validation(errors));
      }
      const result = fakeState().acceptPartnerInvitation(body.token, body.name, body.password);
      if (result.status === 400) return response.untyped(problem(400, "Invitation is invalid or expired"));
      if (result.status === 409) return response.untyped(problem(409, "This person already acts for the partner"));
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

    http.post("/files", async ({ request, response }) => {
      const caller = fileCaller(request);
      if (caller !== 200) return response.untyped(refused(caller));
      const body = await request.json();
      if (body.kind === "design" && body.declared_unit === undefined)
        return response.untyped(validation([{ path: "declared_unit", message: "Required for a design file" }]));
      return response(201).json(fakeState().startFile(body, { origin: new URL(request.url).origin }));
    }),

    http.get("/files/{id}", ({ request, params, response }) => {
      const caller = fileCaller(request);
      if (caller !== 200) return response.untyped(refused(caller));
      const result = fakeState().getFile(params.id);
      if (!("id" in result)) return response.untyped(problem(404, "File not found"));
      return response(200).json(result);
    }),

    http.post("/files/{id}/versions/{versionId}/complete", ({ request, params, response }) => {
      const caller = fileCaller(request);
      if (caller !== 200) return response.untyped(refused(caller));
      const result = fakeState().completeFile(params.id, params.versionId);
      if (!("id" in result))
        return response.untyped(
          result.status === 409 ? problem(409, "Upload not found") : problem(404, "File version not found"),
        );
      return response(200).json(result);
    }),

    http.post("/partner-portal/partners/{partnerId}/files", async ({ request, params, response }) => {
      const caller = fileCaller(request, params.partnerId);
      if (caller !== 200) return response.untyped(refused(caller));
      const body = await request.json();
      if (!PHOTO_CONTENT_TYPES.includes(body.content_type))
        return response.untyped(
          validation([{ path: "content_type", message: `must be one of ${PHOTO_CONTENT_TYPES.join(", ")}` }]),
        );
      const started = fakeState().startFile(
        { ...body, kind: "image" },
        { origin: new URL(request.url).origin, partnerId: params.partnerId },
      );
      return response(201).json(started);
    }),

    http.get("/partner-portal/partners/{partnerId}/files/{id}", ({ request, params, response }) => {
      const caller = fileCaller(request, params.partnerId);
      if (caller !== 200) return response.untyped(refused(caller));
      const result = fakeState().getFile(params.id, params.partnerId);
      if (!("id" in result)) return response.untyped(problem(404, "File not found"));
      return response(200).json(result);
    }),

    http.post(
      "/partner-portal/partners/{partnerId}/files/{id}/versions/{versionId}/complete",
      ({ request, params, response }) => {
        const caller = fileCaller(request, params.partnerId);
        if (caller !== 200) return response.untyped(refused(caller));
        const result = fakeState().completeFile(params.id, params.versionId, params.partnerId);
        if (!("id" in result))
          return response.untyped(
            result.status === 409 ? problem(409, "Upload not found") : problem(404, "File version not found"),
          );
        return response(200).json(result);
      },
    ),

    http.get("/orders", ({ request, response }) => {
      const caller = staffWith(request, "order.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.list(new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/orders/counts", ({ request, response }) => {
      const caller = staffWith(request, "order.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.counts(new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/{id}/ship", async ({ request, params, response }) => {
      const caller = staffWith(request, "order.ship");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.ship(params.id, await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/{id}/paid-by-hand", async ({ request, params, response }) => {
      const caller = staffWith(request, "payment.write");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.paidByHand(params.id, await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    // Object storage, where a signed upload link points: not erp-api, so not typed from its document.
    rawHttp.options(
      `${baseUrl}/__storage/uploads/:fileId/:versionId`,
      () => new HttpResponse(null, { status: 204, headers: STORAGE_CORS }),
    ),

    rawHttp.put(`${baseUrl}/__storage/uploads/:fileId/:versionId`, async ({ request, params }) => {
      const bytes = await request.arrayBuffer();
      const result = fakeState().storeObject(String(params.fileId), String(params.versionId), {
        contentType: request.headers.get("content-type") ?? "",
        size: bytes.byteLength,
      });
      return new HttpResponse(null, { status: result.status, headers: STORAGE_CORS });
    }),
  ];
}
