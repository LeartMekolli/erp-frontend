import createClient from "openapi-fetch";

import { serverApiUrl } from "@/lib/api/config";
import type { paths } from "@/lib/api/schema-types";

/**
 * erp-api as AMI's server calls it, for sign-in, refresh and sign-out.
 * Made per call so it reads the current address and `fetch`.
 */
export function erpClient() {
  return createClient<paths>({ baseUrl: serverApiUrl(), fetch: (request) => fetch(request) });
}

/** Ends an erp-api session from its refresh token alone: logout needs an access token, so refresh once first. */
export async function endErpSession(refreshToken: string): Promise<void> {
  try {
    const { data } = await erpClient().POST("/auth/refresh", { body: { refresh_token: refreshToken } });
    if (!data) return;
    await logoutErp(data.access_token, data.refresh_token);
  } catch {
    // Unreachable: the refresh token simply expires unused.
  }
}

/** Logs out at erp-api; failures are ignored, since AMI clears its cookie either way. */
export async function logoutErp(accessToken: string, refreshToken: string): Promise<void> {
  try {
    await erpClient().POST("/auth/logout", {
      body: { refresh_token: refreshToken },
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Unreachable: nothing more to do.
  }
}
