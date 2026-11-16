import type { paths } from "./schema";

export type { paths };

type JsonOk<P extends keyof paths, M extends "get" | "post"> = paths[P][M] extends {
  responses: { 200: { content: { "application/json": infer Body } } };
}
  ? Body
  : never;

/** `GET /me`: the signed-in user's kind, workspace, roles, permissions and memberships. */
export type MeResponse = JsonOk<"/me", "get">;

/** `GET /partner-portal/me`: a partner person and the partners they act for. */
export type PartnerMeResponse = JsonOk<"/partner-portal/me", "get">;

/** A partner's standing: setting up, approved or suspended. */
export type PartnerStatus = PartnerMeResponse["partners"][number]["status"];

/** A staff permission, as `/me` lists them. */
export type Permission = MeResponse["permissions"][number];

/** A partner person's role at one workshop. */
export type PartnerRole = PartnerMeResponse["partners"][number]["role"];

/** The routes partner pages may call: the partner portal's, and `/me`. */
export type PartnerPaths = {
  [P in keyof paths as P extends `/partner-portal/${string}` | "/me" ? P : never]: paths[P];
};

/** The notification routes: the feed both areas read. */
export type NotificationPaths = {
  [P in keyof paths as P extends "/notifications" | `/notifications/${string}` ? P : never]: paths[P];
};

type JsonBody<P extends keyof paths, M extends "post"> = paths[P][M] extends {
  requestBody: { content: { "application/json": infer Body } };
}
  ? Body
  : never;

/** A refusal with its `code`, as the route documents it for that status, with its extension members. */
type CodedProblem<P extends keyof paths, M extends "post", S extends number, C extends string> = paths[P][M] extends {
  responses: Record<S, { content: { "application/problem+json": infer Body } }>;
}
  ? Extract<Body, { code: C }>
  : never;

/** One order as staff see it, from `GET /orders`. */
export type Order = JsonOk<"/orders", "get">["data"][number];

/** `GET /orders/counts`: how many orders each tab and needs-you reason holds. */
export type OrderCounts = JsonOk<"/orders/counts", "get">;

export type OrderState = Order["state"];
export type PaymentState = Order["payment"]["state"];
export type NeedsReason = Order["needs"][number];

/** `GET /orders`'s query: filters, search, sort and paging. */
export type OrderListQuery = NonNullable<paths["/orders"]["get"]["parameters"]["query"]>;
export type OrderSort = NonNullable<OrderListQuery["sort"]>;

/** `GET /orders/counts`'s query: the list's filters that don't pick a tab. */
export type OrderCountsQuery = NonNullable<paths["/orders/counts"]["get"]["parameters"]["query"]>;

/** `POST /orders/{id}/ship`: courier and tracking, or a label to buy. */
export type ShipBody = JsonBody<"/orders/{id}/ship", "post">;

/** `POST /orders/ship`: up to 25 orders, each with what shipping it alone takes. */
export type ShipManyBody = JsonBody<"/orders/ship", "post">;

/** One order's result from `POST /orders/ship`: the order, or what shipping it alone would have refused. */
export type BulkShipResult = JsonOk<"/orders/ship", "post">["results"][number];

/** `POST /orders/{id}/paid-by-hand`: a payment made outside the payment provider. */
export type PaidByHandBody = JsonBody<"/orders/{id}/paid-by-hand", "post">;

export type OrderLine = Order["lines"][number];
export type OrderPart = OrderLine["parts"][number];
export type LinePartner = NonNullable<OrderLine["partner"]>;

/** `POST /orders/{id}/cancel`: the reason, and the lines when not all of them. */
export type CancelOrderBody = JsonBody<"/orders/{id}/cancel", "post">;

/** `GET /workflow/groups/{id}`: a line's path, with how many pieces are at each step. */
export type Group = JsonOk<"/workflow/groups/{id}", "get">;

/** One piece in a work list, from `GET /workflow/work-orders`. */
export type WorkOrderListItem = JsonOk<"/workflow/work-orders", "get">["data"][number];

/** `GET /workflow/work-orders/{id}`: one piece, its path and every move it has made. */
export type WorkOrderDetail = JsonOk<"/workflow/work-orders/{id}", "get">;
export type Transition = WorkOrderDetail["history"][number];

/** `GET /workflow/workflows/{id}/versions/{number}`: each step's checklist, defects and evidence. */
export type WorkflowVersion = JsonOk<"/workflow/workflows/{id}/versions/{number}", "get">;
export type WorkflowStep = WorkflowVersion["steps"][number];

/** `POST /workflow/moves`: pass, fail or correct pieces at once. */
export type MoveBody = JsonBody<"/workflow/moves", "post">;
export type MoveResponse = JsonOk<"/workflow/moves", "post">;

/** `GET /workflow/groups/{id}/moves`: a line's moves, one item per action, with counts over every page. */
export type MoveHistory = JsonOk<"/workflow/groups/{id}/moves", "get">;
export type LineAction = MoveHistory["data"][number];
export type ActionPiece = LineAction["pieces"][number];

/** `GET /partners/eligible`: who can take a job, and who can't with why. */
export type EligiblePartners = JsonOk<"/partners/eligible", "get">;

/** A job handed to a partner, as `POST /partners/jobs/{groupId}/withdraw` answers it. */
export type JobAssignment = JsonOk<"/partners/jobs/{groupId}/withdraw", "post">;

/** `POST /partners/jobs/{groupId}/offer`: who to offer a job to, and by when. */
export type OfferBody = JsonBody<"/partners/jobs/{groupId}/offer", "post">;

/** `POST /partners/jobs/{groupId}/reassign`: who takes the job, and what the last partner is owed. */
export type ReassignBody = JsonBody<"/partners/jobs/{groupId}/reassign", "post">;

/** One job as the partner sees it, from `GET /partner-portal/partners/{partnerId}/jobs`. */
export type PartnerJob = JsonOk<"/partner-portal/partners/{partnerId}/jobs", "get">["data"][number];

/** Whether a job is offered, accepted or finished. */
export type PartnerJobStatus = PartnerJob["status"];

/** One job with its pieces, from `GET /partner-portal/partners/{partnerId}/jobs/{groupId}`. */
export type PartnerJobDetail = JsonOk<"/partner-portal/partners/{partnerId}/jobs/{groupId}", "get">;

/** One piece of a partner's job and its moves, from `GET .../jobs/{groupId}/work-orders/{workOrderId}`. */
export type PartnerWorkOrder = JsonOk<"/partner-portal/partners/{partnerId}/jobs/{groupId}/work-orders/{workOrderId}", "get">;

/** A partner's job's moves, one item per action, from `GET .../jobs/{groupId}/moves`. */
export type PartnerMoveHistory = JsonOk<"/partner-portal/partners/{partnerId}/jobs/{groupId}/moves", "get">;

/** One comment on a partner's job as the partner reads it, from `GET .../jobs/{groupId}/comments`. */
export type PartnerJobComment = JsonOk<"/partner-portal/partners/{partnerId}/jobs/{groupId}/comments", "get">["data"][number];

/** `GET .../owed`: what a partner is owed, with its totals across every page, newest hand-over first. */
export type PartnerOwed = JsonOk<"/partner-portal/partners/{partnerId}/owed", "get">;

/** One job on the owed list: what it's worth, what payouts have paid and what's left. */
export type OwedJob = PartnerOwed["jobs"][number];

/** One payout to the partner, with what it paid per job, from `GET .../payouts`. */
export type PartnerPayout = JsonOk<"/partner-portal/partners/{partnerId}/payouts", "get">["data"][number];

export type PayoutStatus = PartnerPayout["status"];

/** Where the partner's payout account stands, from `GET .../payout-account`. */
export type PayoutAccountState = JsonOk<"/partner-portal/partners/{partnerId}/payout-account", "get">["state"];

/** One partner workshop as staff see it, from `GET /partners/{id}`; `GET /partners` lists the same shape. */
export type StaffPartner = JsonOk<"/partners/{id}", "get">;

/** `GET /partners/{id}/owed`: what a partner is owed as staff read it, with the order behind each job. */
export type StaffPartnerOwed = JsonOk<"/partners/{id}/owed", "get">;

/** One job on that list: the portal's fields, plus its order, why staff set its amount and whether the customer paid. */
export type StaffOwedJob = StaffPartnerOwed["jobs"][number];

/** The order and line a job is from; for a claim remake, the claimed ones. `line_position` counts from 0. */
export type JobOrder = NonNullable<StaffOwedJob["order"]>;

/** One payout as staff read it, from `GET /partners/{id}/payouts`: the portal's fields, plus why the provider refused and each job's order. */
export type StaffPayout = JsonOk<"/partners/{id}/payouts", "get">["data"][number];

/** `POST /partners/{id}/payouts`'s 409: the payout account isn't ready, or nothing is due. */
export type PayRefusedProblem = CodedProblem<"/partners/{id}/payouts", "post", 409, "payout_account_not_ready" | "nothing_due">;

/** One comment as staff read it, from `GET /orders/{id}/comments`, with the partner that reads it too, if any. */
export type OrderComment = JsonOk<"/orders/{id}/comments", "get">["data"][number];

/** `POST /orders/{id}/comments`: the body, its line, and who the box said would read it. The line decides who does. */
export type StaffCommentBody = JsonBody<"/orders/{id}/comments", "post">;

/** That post's 409 when someone else would read the comment now: `partner`, or null for staff alone. */
export type ReadersChangedProblem = CodedProblem<"/orders/{id}/comments", "post", 409, "readers_changed">;

/** One claim, from `GET /claims`. */
export type Claim = JsonOk<"/claims", "get">["data"][number];

/** `GET /search`: ⌘K's orders, customers, partners and help articles, at most 5 of each. */
export type SearchResponse = JsonOk<"/search", "get">;

/** `GET /ai/runs/{id}`: one of your AI runs, with its answer once done. */
export type AiRun = JsonOk<"/ai/runs/{id}", "get">;
export type AiRef = NonNullable<AiRun["answer"]>["refs"][number];
export type SuggestionKind = NonNullable<NonNullable<AiRun["answer"]>["action"]>["kind"];

/** One in-app notification, from `GET /notifications`. */
export type FeedEntry = JsonOk<"/notifications", "get">["data"][number];

/** `POST /auth/invitations/preview`: what an invitation link is, before the page shows a form. */
export type InvitationPreview = JsonOk<"/auth/invitations/preview", "post">;
