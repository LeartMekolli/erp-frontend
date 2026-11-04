import createClient from "openapi-fetch";

import { clientSession } from "@/lib/session/client-session";

import { browserApiUrl } from "./config";
import type { paths } from "./schema-types";

export interface TokenSource {
  getAccessToken(options?: { force?: boolean }): Promise<string>;
}

/** erp-api's public sign-in routes: called signed out, with no token. */
const isPublic = (schemaPath: string) => schemaPath.startsWith("/auth/");

/**
 * The typed erp-api client the browser uses. Adds the access token to every
 * call and, after a 401, retries once with a freshly refreshed token.
 */
export function createApiClient(session: TokenSource, baseUrl: string) {
  const client = createClient<paths>({ baseUrl, fetch: (request) => fetch(request) });
  const retries = new WeakMap<Request, Request>();

  client.use({
    async onRequest({ request, schemaPath }) {
      if (isPublic(schemaPath)) return undefined;
      request.headers.set("authorization", `Bearer ${await session.getAccessToken()}`);
      retries.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response, schemaPath }) {
      if (response.status !== 401 || isPublic(schemaPath)) return undefined;
      const retry = retries.get(request);
      if (!retry) return undefined;
      retry.headers.set("authorization", `Bearer ${await session.getAccessToken({ force: true })}`);
      return fetch(retry);
    },
  });

  return client;
}

export const api = createApiClient(
  { getAccessToken: (options) => clientSession().getAccessToken(options) },
  browserApiUrl(),
);
