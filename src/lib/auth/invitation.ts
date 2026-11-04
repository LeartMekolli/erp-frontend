import { api } from "@/lib/api/client";
import { isApiProblem, type ApiProblem } from "@/lib/api/problem";
import type { InvitationPreview } from "@/lib/api/schema-types";

export type { InvitationPreview };

/**
 * What an invitation link is (`POST /auth/invitations/preview`): staff,
 * partner or customer, for whom, and whether it can still be accepted. Null
 * for a token erp-api never issued. Throws when erp-api can't be reached.
 */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const { data, response } = await api.POST("/auth/invitations/preview", { body: { token } });
  if (data) return data;
  // 400: a token too long to be one erp-api issued.
  if (response.status === 404 || response.status === 400) return null;
  throw new Error(`The invitation preview answered ${response.status}`);
}

/** Staff always create an account; a partner person who already has one sends only the token. */
export type AcceptInput =
  | { kind: "staff"; token: string; name: string; password: string }
  | { kind: "partner"; token: string; name?: string; password?: string };

/**
 * `invalid`: used, expired or unknown. `taken`: erp-api refuses the email (an
 * existing account for staff; another kind, or already in the workshop, for partners).
 */
export type AcceptResult = "accepted" | "invalid" | "taken" | { problem: ApiProblem };

/** Accepts on the route for the invitation's kind. Throws when erp-api can't be reached. */
export async function acceptInvitation(input: AcceptInput): Promise<AcceptResult> {
  const { response, error } = await send(input);
  if (response.ok) return "accepted";
  if (response.status === 409) return "taken";
  const problem: ApiProblem = isApiProblem(error)
    ? error
    : { type: "about:blank", title: response.statusText, status: response.status };
  if (response.status === 400 && !problem.errors?.length) return "invalid";
  return { problem };
}

function send(input: AcceptInput) {
  const { token, name, password } = input;
  switch (input.kind) {
    case "staff":
      return api.POST("/auth/invitations/accept", { body: { token, name: name ?? "", password: password ?? "" } });
    case "partner":
      return api.POST("/auth/partner-invitations/accept", { body: { token, name, password } });
    default:
      // Customers accept on their storefront, never in AMI.
      throw new Error("AMI accepts only staff and partner invitations");
  }
}
