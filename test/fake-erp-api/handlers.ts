import { HttpResponse, http as rawHttp, type HttpHandler } from "msw";
import { createOpenApiHttp } from "openapi-msw";

import type { PartnerRole, paths, Permission } from "../../src/lib/api/schema-types";
import type { Answer } from "./orders";
import { PARTNER_NAMES, type FakeUser } from "./seed";
import { search } from "./search";
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

/**
 * erp-api's error body for a Nest exception (`api-error.ts`, `toApiError`): a `code` brings its
 * extension members, and `errors` names what it refuses with or without one.
 */
function problem(
  status: number,
  detail: string,
  code?: string,
  extensions?: Record<string, unknown>,
  errors?: { path: string; message: string }[],
) {
  return HttpResponse.json(
    {
      ...(code ? extensions : {}),
      type: "about:blank",
      title: TITLES[status] ?? "Error",
      status,
      detail,
      ...(code ? { code } : {}),
      ...(errors ? { errors } : {}),
    },
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

/**
 * Who may call a partner route: someone acting for that workshop. A 401 with
 * no user and a 404 for anyone else (`route-markers.ts:41-48`); an answer
 * (`write`) from a suspended workshop is a 403, while reads still work. A
 * role below `role` is a 403. Returns the problem to send, or null when the
 * call may go on.
 */
function partnerCaller(request: Request, partnerId: string, write = false, role: PartnerRole = "member"): Response | null {
  const caller = partnerPerson(request, partnerId, write, role);
  return caller instanceof Response ? caller : null;
}

/** erp-api's order of partner roles (`src/modules/partners/partner-roles.ts:2-7`). */
const PARTNER_ROLES: readonly PartnerRole[] = ["member", "admin", "owner"];

/** As `partnerCaller`, but gives the person when the call may go on. */
function partnerPerson(request: Request, partnerId: string, write = false, role: PartnerRole = "member"): FakeUser | Response {
  const user = fakeState().authenticate(bearer(request));
  if (!user) return problem(401, "Unauthorized");
  if (user.kind !== "partner" || !user.organisations.includes(partnerId)) return problem(404, "Partner not found");
  if (PARTNER_ROLES.indexOf(user.partnerRole ?? "owner") < PARTNER_ROLES.indexOf(role)) return problem(403, "Your role can't do this");
  if (write && fakeState().isPartnerSuspended(partnerId)) return problem(403, "The partner is suspended");
  return user;
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
  return answer.status === 400
    ? validation(answer.errors)
    : problem(answer.status, answer.detail, answer.code, answer.extensions, answer.errors);
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

    // The partner's jobs (`partner-jobs.controller.ts:64-78`, `jobs.controller.ts:165-205`).
    http.get("/partner-portal/partners/{partnerId}/jobs", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.list(params.partnerId, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.detail(params.partnerId, params.groupId);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partner-portal/partners/{partnerId}/jobs/{groupId}/accept", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId, true);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.answer(params.partnerId, params.groupId, "accept", request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partner-portal/partners/{partnerId}/jobs/{groupId}/decline", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId, true);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.answer(params.partnerId, params.groupId, "decline", request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    // The partner's pay (`partner-jobs.controller.ts:41`, `payouts.controller.ts:59`, `payout-accounts.controller.ts:27-48`):
    // admins and owners read it; only the owner gets the payout account link, never while suspended.
    http.get("/partner-portal/partners/{partnerId}/owed", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId, false, "admin");
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().earnings.owed(params.partnerId, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/payouts", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId, false, "admin");
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().earnings.payouts(params.partnerId, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/payout-account", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId, false, "admin");
      if (refusedCall) return response.untyped(refusedCall);
      return response(200).json(fakeState().earnings.account(params.partnerId));
    }),

    http.post("/partner-portal/partners/{partnerId}/payout-account/link", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId, true, "owner");
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().earnings.link(params.partnerId, new URL(request.url).origin);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    // A job the partner holds (`partner-jobs.controller.ts`, `job-moves.controller.ts`, `job-comments.controller.ts`):
    // anything of an offer, or of anyone else's job, is a 404.
    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}/work-orders/{workOrderId}", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.piece(params.partnerId, params.groupId, params.workOrderId);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}/moves", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.moves(params.partnerId, params.groupId, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}/moves/{moveId}/photos/{fileVersionId}/url", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.photoUrl(params.partnerId, params.groupId, params.moveId, params.fileVersionId);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}/design", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.design(params.partnerId, params.groupId);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}/steps/{stepKey}/sop", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      const answer = fakeState().partnerJobs.sop(params.partnerId, params.groupId, params.stepKey);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    // A suspended partner can still move the pieces of jobs it holds, so it can finish them (`partner-jobs.controller.ts:146`).
    http.post("/partner-portal/partners/{partnerId}/moves", async ({ request, params, response }) => {
      const person = partnerPerson(request, params.partnerId);
      if (person instanceof Response) return response.untyped(person);
      const body = await request.json();
      const answer = fakeState().partnerJobs.move(params.partnerId, body, request.headers.get("idempotency-key"), { id: person.id, name: person.name });
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}/comments", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      if (!fakeState().partnerJobs.holds(params.partnerId, params.groupId)) return response.untyped(problem(404, "Job not found"));
      const answer = fakeState().comments.partnerList(params.groupId, params.partnerId, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partner-portal/partners/{partnerId}/jobs/{groupId}/comments", async ({ request, params, response }) => {
      const person = partnerPerson(request, params.partnerId, true);
      if (person instanceof Response) return response.untyped(person);
      if (!fakeState().partnerJobs.holds(params.partnerId, params.groupId)) return response.untyped(problem(404, "Job not found"));
      const partner = { id: params.partnerId, name: PARTNER_NAMES[params.partnerId] ?? "Workshop" };
      const answer = fakeState().comments.partnerPost(
        params.groupId,
        partner,
        { id: person.id, name: person.name },
        (await request.json()) as Record<string, unknown>,
        request.headers.get("idempotency-key"),
      );
      return answer.ok ? response(201).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partner-portal/partners/{partnerId}/jobs/{groupId}/comments/{commentId}/attachments/{fileVersionId}/url", ({ request, params, response }) => {
      const refusedCall = partnerCaller(request, params.partnerId);
      if (refusedCall) return response.untyped(refusedCall);
      if (!fakeState().partnerJobs.holds(params.partnerId, params.groupId)) return response.untyped(problem(404, "Job not found"));
      const answer = fakeState().comments.partnerAttachmentUrl(params.groupId, params.partnerId, params.commentId, params.fileVersionId);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
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

    http.get("/files/{id}/versions/{versionId}/url", ({ request, params, response }) => {
      const caller = staffWith(request, "file.read");
      if (caller instanceof Response) return response.untyped(caller);
      return response(200).json({
        url: `https://storage.example.test/${params.versionId}`,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
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

    // Staff and partners (`partners.controller.ts:60`, `jobs.controller.ts:148`, `payouts.controller.ts:31`,
    // `payout-accounts.controller.ts:62`): each route has its own permission, and a partner that isn't there is a 404.
    http.get("/partners", ({ request, response }) => {
      const caller = staffWith(request, "partner.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().partners.list(new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partners/{id}/owed", ({ request, params, response }) => {
      const caller = staffWith(request, "partner.read");
      if (caller instanceof Response) return response.untyped(caller);
      const known = fakeState().partners.get(params.id);
      if (!known.ok) return response.untyped(refusal(known));
      const answer = fakeState().earnings.staffOwed(params.id, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partners/{id}/payouts", ({ request, params, response }) => {
      const caller = staffWith(request, "payment.read");
      if (caller instanceof Response) return response.untyped(caller);
      const known = fakeState().partners.get(params.id);
      if (!known.ok) return response.untyped(refusal(known));
      const answer = fakeState().earnings.staffPayouts(params.id, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partners/{id}/payouts", ({ request, params, response }) => {
      const caller = staffWith(request, "payment.payout");
      if (caller instanceof Response) return response.untyped(caller);
      const known = fakeState().partners.get(params.id);
      if (!known.ok) return response.untyped(refusal(known));
      const answer = fakeState().earnings.pay(params.id, request.headers.get("idempotency-key"));
      return answer.ok ? response(202).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partners/{id}/payout-account/link", ({ request, params, response }) => {
      const caller = staffWith(request, "partner.write");
      if (caller instanceof Response) return response.untyped(caller);
      const known = fakeState().partners.get(params.id);
      if (!known.ok) return response.untyped(refusal(known));
      const answer = fakeState().earnings.link(params.id, new URL(request.url).origin);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

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

    http.get("/orders/{id}", ({ request, params, response }) => {
      const caller = staffWith(request, "order.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.get(params.id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/{id}/cancel", async ({ request, params, response }) => {
      const caller = staffWith(request, "order.write");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.cancel(params.id, await request.json(), request.headers.get("idempotency-key"), caller.permissions.includes("payment.refund"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/ship", async ({ request, response }) => {
      const caller = staffWith(request, "order.ship");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.shipMany(await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/{id}/ship", async ({ request, params, response }) => {
      const caller = staffWith(request, "order.ship");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.ship(params.id, await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/{id}/deliver", ({ request, params, response }) => {
      const caller = staffWith(request, "order.ship");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.deliver(params.id, request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/{id}/paid-by-hand", async ({ request, params, response }) => {
      const caller = staffWith(request, "payment.write");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().orders.paidByHand(params.id, await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/workflow/groups/{id}", ({ request, params, response }) => {
      const caller = staffWith(request, "workflow.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().production.group(params.id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/workflow/groups/{id}/moves", ({ request, params, response }) => {
      const caller = staffWith(request, "workflow.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().production.moves(params.id, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/workflow/work-orders", ({ request, response }) => {
      const caller = staffWith(request, "workflow.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().production.pieces(new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/workflow/work-orders/{id}", ({ request, params, response }) => {
      const caller = staffWith(request, "workflow.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().production.piece(params.id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/workflow/workflows/{id}/versions/{number}", ({ request, params, response }) => {
      const caller = staffWith(request, "workflow.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().production.version(params.id, Number(params.number));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/workflow/moves", async ({ request, response }) => {
      const caller = staffWith(request, "workflow.move");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().production.move(await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/partners/eligible", ({ request, response }) => {
      const caller = staffWith(request, "partner.assign");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().jobs.eligible(new URL(request.url).searchParams.get("group_id") ?? "");
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partners/jobs/{groupId}/offer", async ({ request, params, response }) => {
      const caller = staffWith(request, "partner.assign");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().jobs.offer(params.groupId, await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(201).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partners/jobs/{groupId}/withdraw", ({ request, params, response }) => {
      const caller = staffWith(request, "partner.assign");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().jobs.withdraw(params.groupId, request.headers.get("idempotency-key"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/partners/jobs/{groupId}/reassign", async ({ request, params, response }) => {
      const caller = staffWith(request, "partner.assign");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().jobs.reassign(params.groupId, await request.json(), request.headers.get("idempotency-key"));
      return answer.ok ? response(201).json(answer.body) : response.untyped(refusal(answer));
    }),

    // After `/partners/eligible`: handlers match in order, and `{id}` would take "eligible".
    http.get("/partners/{id}", ({ request, params, response }) => {
      const caller = staffWith(request, "partner.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().partners.get(params.id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/orders/{id}/comments", ({ request, params, response }) => {
      const caller = staffWith(request, "order.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().comments.list(params.id, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders/{id}/comments", async ({ request, params, response }) => {
      const caller = staffWith(request, "order.write");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().comments.post(params.id, await request.json(), caller, request.headers.get("idempotency-key"));
      return answer.ok ? response(201).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/orders/{id}/comments/{commentId}/attachments/{fileVersionId}/url", ({ request, params, response }) => {
      const caller = staffWith(request, "order.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().comments.attachmentUrl(params.id, params.commentId, params.fileVersionId);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/claims", ({ request, response }) => {
      const caller = staffWith(request, "order.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().comments.claims(new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    // What the New order page reads (`customers.controller.ts:70,152`, `products.controller.ts`,
    // `options.controller.ts:39`, `quotes.controller.ts`): each route has its own permission.
    http.get("/customers/{id}", ({ request, params, response }) => {
      const caller = staffWith(request, "customer.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().catalog.customer(params.id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/customers/{id}/addresses", ({ request, params, response }) => {
      const caller = staffWith(request, "customer.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().catalog.addresses(params.id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/catalog/products", ({ request, response }) => {
      const caller = staffWith(request, "catalog.read");
      if (caller instanceof Response) return response.untyped(caller);
      const query = new URL(request.url).searchParams;
      const answer = fakeState().catalog.products(query.get("customer_id"), query);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/catalog/option-groups", ({ request, response }) => {
      const caller = staffWith(request, "catalog.read");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().catalog.optionGroups();
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/pricing/quotes/delivery-speeds", ({ request, response }) => {
      const caller = staffWith(request, "quote.create");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().catalog.speeds(new URL(request.url).searchParams.get("customer_id"));
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    // Quoting and placing (`quotes.controller.ts`, `couriers.controller.ts:104`, `orders.controller.ts:24-47`).
    // A quote that can't be priced is a 200, which erp-api documents under its 201.
    http.post("/pricing/quotes", async ({ request, response }) => {
      const caller = staffWith(request, "quote.create");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().quotes.quote(await request.json(), request.headers.get("idempotency-key"));
      if (!answer.ok) return response.untyped(refusal(answer));
      return answer.body.accepted ? response(201).json(answer.body) : response.untyped(HttpResponse.json(answer.body, { status: 200 }));
    }),

    http.post("/orders/shipping-rates", async ({ request, response }) => {
      const caller = staffWith(request, "order.write");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().quotes.rates((await request.json()).customer_id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.post("/orders", async ({ request, response }) => {
      const caller = staffWith(request, "order.write");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().quotes.place(
        await request.json(),
        { id: caller.id, name: caller.name },
        request.headers.get("idempotency-key"),
      );
      return answer.ok ? response(201).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/search", ({ request, response }) => {
      const user = fakeState().authenticate(bearer(request));
      if (!user) return response.untyped(problem(401, "Unauthorized"));
      const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
      if (q.length < 1 || q.length > 100)
        return response.untyped(validation([{ path: "q", message: "must be 1 to 100 characters" }]));
      if (user.kind !== "staff") return response.untyped(problem(403, "Search is for staff"));
      return response(200).json(search(user, q, fakeState().orders.all()));
    }),

    http.post("/ai/ask", async ({ request, response }) => {
      const caller = staffWith(request, "ai.use");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().ai.ask(caller.id, (await request.json()).question);
      return answer.ok ? response(202).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/ai/runs/{id}", ({ request, params, response }) => {
      const caller = staffWith(request, "ai.use");
      if (caller instanceof Response) return response.untyped(caller);
      const answer = fakeState().ai.run(caller.id, params.id);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    // Anyone signed in reads their own feed; no permission (`feed.controller.ts:33-37`).
    http.get("/notifications", ({ request, response }) => {
      const user = fakeState().authenticate(bearer(request));
      if (!user) return response.untyped(problem(401, "Unauthorized"));
      const answer = fakeState().notifications.list(user.id, new URL(request.url).searchParams);
      return answer.ok ? response(200).json(answer.body) : response.untyped(refusal(answer));
    }),

    http.get("/notifications/unread-count", ({ request, response }) => {
      const user = fakeState().authenticate(bearer(request));
      if (!user) return response.untyped(problem(401, "Unauthorized"));
      return response(200).json({ count: fakeState().notifications.unread(user.id) });
    }),

    http.post("/notifications/read-all", ({ request, response }) => {
      const user = fakeState().authenticate(bearer(request));
      if (!user) return response.untyped(problem(401, "Unauthorized"));
      fakeState().notifications.readAll(user.id);
      return response(204).empty();
    }),

    http.post("/notifications/{id}/read", ({ request, params, response }) => {
      const user = fakeState().authenticate(bearer(request));
      if (!user) return response.untyped(problem(401, "Unauthorized"));
      const answer = fakeState().notifications.markRead(user.id, params.id);
      return answer.ok ? response(204).empty() : response.untyped(refusal(answer));
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
