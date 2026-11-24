/** Readable cookie that remembers a workspace, only to prefill the sign-in field. */
export const WORKSPACE_HINT_COOKIE = "ami_workspace_hint";

/**
 * First path segments AMI owns. Anything else in first place is read as a
 * workspace from an erp-api email link. Add every new top-level route here.
 */
export const APP_ROUTES: readonly string[] = [
  "",
  "sign-in",
  "forgot-password",
  "reset-password",
  "accept-invitation",
  "partner-portal",
  "session",
  "orders",
  "billing",
  "dashboard",
  "production",
  "partners",
  "customers",
  "claims",
  "catalog",
  "pricing",
  "payments",
  "reports",
  "settings",
  "help",
  "_next",
  "favicon.ico",
];

/** A workspace slug as erp-api allows it: lowercase letters, digits and inner hyphens, at most 63. */
export const WORKSPACE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * erp-api builds links as `<WEB_URL>/{tenant}/...` when there are no
 * subdomains, so `/demo/accept-invitation` means workspace `demo`, page
 * `/accept-invitation`.
 */
export function splitWorkspacePrefix(pathname: string): { workspace: string | null; path: string } {
  const [, first = "", ...rest] = pathname.split("/");
  if (APP_ROUTES.includes(first) || !WORKSPACE_SLUG.test(first)) return { workspace: null, path: pathname };
  const path = `/${rest.join("/")}`;
  return { workspace: first, path: path === "/" || path === "//" ? "/" : path };
}
