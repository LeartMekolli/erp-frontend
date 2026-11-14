import createClient from "openapi-fetch";

import { clientSession } from "@/lib/session/client-session";

import { browserApiUrl } from "./config";
import type { NotificationPaths, PartnerPaths, paths } from "./schema-types";

export interface TokenSource {
  getAccessToken(options?: { force?: boolean }): Promise<string>;
}

/** erp-api's public sign-in routes: called signed out, with no token. */
const isPublic = (schemaPath: string) => schemaPath.startsWith("/auth/");

/**
 * The typed erp-api client the browser uses. Adds the access token to every
 * call and, after a 401, retries once with a freshly refreshed token. `P`
 * narrows the routes it can name (see `partnerApi`).
 */
export function createApiClient<P extends object = paths>(session: TokenSource, baseUrl: string) {
  const client = createClient<P>({ baseUrl, fetch: (request) => fetch(request) });
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

const sessionTokens: TokenSource = { getAccessToken: (options) => clientSession().getAccessToken(options) };

export const api = createApiClient(sessionTokens, browserApiUrl());

/**
 * The client for partner pages: it can only name partner-portal routes and
 * `/me`, so a partner screen can't call a staff route, and customers or prices
 * can't reach one by mistake. ESLint keeps `api` out of the partner area.
 */
export const partnerApi = createApiClient<PartnerPaths>(sessionTokens, browserApiUrl());

/**
 * The feed both areas read: the caller's own notifications, nothing of the
 * workspace's. It can only name `/notifications...` routes, so the bell's
 * hooks never use `api`.
 */
export const notificationsApi = createApiClient<NotificationPaths>(sessionTokens, browserApiUrl());
