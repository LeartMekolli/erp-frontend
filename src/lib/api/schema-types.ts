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

/** `POST /orders/{id}/paid-by-hand`: a payment made outside the payment provider. */
export type PaidByHandBody = JsonBody<"/orders/{id}/paid-by-hand", "post">;

/** One in-app notification, from `GET /notifications`. */
export type FeedEntry = JsonOk<"/notifications", "get">["data"][number];

/** `POST /auth/invitations/preview`: what an invitation link is, before the page shows a form. */
export type InvitationPreview = JsonOk<"/auth/invitations/preview", "post">;
