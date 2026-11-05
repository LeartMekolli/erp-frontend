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

/** `POST /auth/invitations/preview`: what an invitation link is, before the page shows a form. */
export type InvitationPreview = JsonOk<"/auth/invitations/preview", "post">;
