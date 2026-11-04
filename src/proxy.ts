import { NextResponse, type NextRequest } from "next/server";

import { splitWorkspacePrefix } from "@/lib/routes";
import { writeWorkspaceHint } from "@/lib/session/cookies";

/**
 * Accepts erp-api's workspace-prefixed email links (`/demo/accept-invitation#token=…`):
 * sends them to the same page without the prefix and remembers the workspace
 * to prefill the next sign-in. The browser keeps the `#token` across the redirect.
 */
export function proxy(request: NextRequest) {
  const { workspace, path } = splitWorkspacePrefix(request.nextUrl.pathname);
  if (!workspace) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = path;
  const response = NextResponse.redirect(target);
  writeWorkspaceHint(response, workspace, new URL(request.url));
  return response;
}

export const config = {
  // Skip Next's own files and anything with a file extension.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
