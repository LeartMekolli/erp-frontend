import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { resolveDestination } from "@/lib/auth/destination";
import { writeSessionCookie, writeWorkspaceHint } from "@/lib/session/cookies";
import { erpClient, logoutErp } from "@/lib/session/erp-auth";
import { refuseCrossOrigin } from "@/lib/session/same-origin";
import { sealSession } from "@/lib/session/server-session";

const loginBody = z.object({
  workspace: z.string().trim().min(1).max(63),
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(128),
});

const unreachable = () => NextResponse.json({ error: "api_unreachable" }, { status: 502 });

/**
 * Signs in at erp-api, keeps the refresh token in the sealed `ami_session`
 * cookie, and hands the page only the short-lived access token.
 */
export async function POST(request: NextRequest) {
  const refused = refuseCrossOrigin(request);
  if (refused) return refused;

  const body = loginBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const api = erpClient();
  let tokens;
  try {
    const { data, error, response } = await api.POST("/auth/login", { body: body.data });
    if (response.status === 401) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    if (response.status === 429) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    if (response.status === 400) return NextResponse.json({ error: "invalid", problem: error }, { status: 400 });
    if (!data) return unreachable();
    tokens = data;
  } catch {
    return unreachable();
  }

  let me;
  try {
    const { data } = await api.GET("/me", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!data) {
      await logoutErp(tokens.access_token, tokens.refresh_token);
      return unreachable();
    }
    me = data;
  } catch {
    return unreachable();
  }

  const destination = resolveDestination(me);
  if (destination.kind === "customer" || destination.kind === "no-access") {
    await logoutErp(tokens.access_token, tokens.refresh_token);
    return NextResponse.json({ error: destination.kind === "customer" ? "customer" : "no_access" }, { status: 403 });
  }

  const now = Date.now();
  const sealed = await sealSession({
    refreshToken: tokens.refresh_token,
    workspace: body.data.workspace,
    kind: destination.kind === "staff" ? "staff" : "partner",
    partnerIds: destination.kind === "partner" ? [destination.partnerId] : destination.kind === "choose-partner" ? destination.partnerIds : [],
    signedInAt: now,
    lastActiveAt: now,
  });

  const response = NextResponse.json({
    accessToken: tokens.access_token,
    expiresAt: tokens.expires_at,
    signedInAt: now,
    destination,
  });
  const url = new URL(request.url);
  writeSessionCookie(response, sealed, url);
  writeWorkspaceHint(response, body.data.workspace, url);
  return response;
}
