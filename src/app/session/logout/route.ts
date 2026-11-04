import { NextResponse, type NextRequest } from "next/server";

import { clearSessionCookie } from "@/lib/session/cookies";
import { endErpSession, logoutErp } from "@/lib/session/erp-auth";
import { refuseCrossOrigin } from "@/lib/session/same-origin";
import { SESSION_COOKIE, openSession } from "@/lib/session/server-session";

/** Signs out at erp-api (revoking both tokens) and clears the cookie, whatever erp-api answers. */
export async function POST(request: NextRequest) {
  const refused = refuseCrossOrigin(request);
  if (refused) return refused;

  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (accessToken) await logoutErp(accessToken, session.refreshToken);
    else await endErpSession(session.refreshToken);
  }

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response, new URL(request.url));
  return response;
}
