import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { clearSessionCookie, writeSessionCookie } from "@/lib/session/cookies";
import { endErpSession, erpClient } from "@/lib/session/erp-auth";
import { checkLimits } from "@/lib/session/limits";
import { refuseCrossOrigin } from "@/lib/session/same-origin";
import { SESSION_COOKIE, openSession, sealSession } from "@/lib/session/server-session";

const refreshBody = z.object({ activeAt: z.number().int().nonnegative().optional() }).catch({});

type Reason = "none" | "idle" | "expired" | "revoked";

function ended(reason: Reason, url: URL): NextResponse {
  const response = NextResponse.json({ reason }, { status: 401 });
  clearSessionCookie(response, url);
  return response;
}

/**
 * Swaps the cookie's refresh token for a new pair. Enforces the 3-hour idle and
 * 12-hour limits here too, since some browsers restore session cookies.
 * The page serialises calls across tabs, so erp-api never sees a token twice.
 */
export async function POST(request: NextRequest) {
  const refused = refuseCrossOrigin(request);
  if (refused) return refused;
  const url = new URL(request.url);

  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return ended("none", url);

  const { activeAt } = refreshBody.parse(await request.json().catch(() => ({})));
  const now = Date.now();
  const lastActiveAt = Math.max(session.lastActiveAt, Math.min(activeAt ?? 0, now));

  const limit = checkLimits({ signedInAt: session.signedInAt, lastActiveAt }, now);
  if (limit !== "ok") {
    await endErpSession(session.refreshToken);
    return ended(limit, url);
  }

  try {
    const { data, response } = await erpClient().POST("/auth/refresh", {
      body: { refresh_token: session.refreshToken },
    });
    if (response.status === 401) return ended("revoked", url);
    if (!data) return NextResponse.json({ error: "api_unreachable" }, { status: 502 });

    const next = NextResponse.json({
      accessToken: data.access_token,
      expiresAt: data.expires_at,
      signedInAt: session.signedInAt,
      lastActiveAt,
    });
    writeSessionCookie(next, await sealSession({ ...session, refreshToken: data.refresh_token, lastActiveAt }), url);
    return next;
  } catch {
    return NextResponse.json({ error: "api_unreachable" }, { status: 502 });
  }
}
