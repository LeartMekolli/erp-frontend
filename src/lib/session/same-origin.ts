import { NextResponse } from "next/server";

/**
 * The session routes act on a cookie, so they only answer AMI's own pages:
 * same `Origin`, JSON body. A cross-site form can't send either. Returns the
 * refusal to send, or null when the request may go on.
 */
export function refuseCrossOrigin(request: Request): NextResponse | null {
  const sameOrigin = request.headers.get("origin") === new URL(request.url).origin;
  const json = request.headers.get("content-type")?.startsWith("application/json") ?? false;
  return sameOrigin && json ? null : NextResponse.json({ error: "forbidden" }, { status: 403 });
}
