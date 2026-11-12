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

/** A staff permission, as `/me` lists them. */
export type Permission = MeResponse["permissions"][number];

/** A partner person's role at one workshop. */
export type PartnerRole = PartnerMeResponse["partners"][number]["role"];

/** The routes partner pages may call: the partner portal's, and `/me`. */
export type PartnerPaths = {
  [P in keyof paths as P extends `/partner-portal/${string}` | "/me" ? P : never]: paths[P];
};

type JsonBody<P extends keyof paths, M extends "post"> = paths[P][M] extends {
  requestBody: { content: { "application/json": infer Body } };
}
  ? Body
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

/** `GET /partners/eligible`: who can take a job, and who can't with why. */
export type EligiblePartners = JsonOk<"/partners/eligible", "get">;

/** A job handed to a partner, as `POST /partners/jobs/{groupId}/withdraw` answers it. */
export type JobAssignment = JsonOk<"/partners/jobs/{groupId}/withdraw", "post">;

/** `POST /partners/jobs/{groupId}/offer`: who to offer a job to, and by when. */
export type OfferBody = JsonBody<"/partners/jobs/{groupId}/offer", "post">;

/** `POST /partners/jobs/{groupId}/reassign`: who takes the job, and what the last partner is owed. */
export type ReassignBody = JsonBody<"/partners/jobs/{groupId}/reassign", "post">;

/** One comment as staff read it, from `GET /orders/{id}/comments`. */
export type OrderComment = JsonOk<"/orders/{id}/comments", "get">["data"][number];

/** `POST /orders/{id}/comments`: the body, its line, and whether it goes to the partner. */
export type StaffCommentBody = JsonBody<"/orders/{id}/comments", "post">;

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
