import type { NextResponse } from "next/server";

import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";

import { SESSION_COOKIE, sessionCookieOptions } from "./server-session";

const HINT_MAX_AGE_S = 30 * 24 * 60 * 60;

export function writeSessionCookie(response: NextResponse, sealed: string, requestUrl: URL): void {
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions(requestUrl));
}

export function clearSessionCookie(response: NextResponse, requestUrl: URL): void {
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(requestUrl), maxAge: 0 });
}

/** Readable by the page on purpose: it only prefills the workspace field. */
export function writeWorkspaceHint(response: NextResponse, workspace: string, requestUrl: URL): void {
  response.cookies.set(WORKSPACE_HINT_COOKIE, workspace, {
    path: "/",
    sameSite: "lax",
    secure: sessionCookieOptions(requestUrl).secure,
    maxAge: HINT_MAX_AGE_S,
  });
}
