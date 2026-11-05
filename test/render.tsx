import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import { clientSession } from "../src/lib/session/client-session";

import { FAKE_PASSWORD, WORKSPACE, type FakeUser } from "./fake-erp-api/seed";
import { fakeState } from "./fake-erp-api/state";

/** Signs `user` in to the fake erp-api and hands its token to the app's `api` client. */
export function signInAs(user: FakeUser): string {
  const tokens = fakeState().login(WORKSPACE, user.email, FAKE_PASSWORD);
  if ("status" in tokens) throw new Error(`fake sign-in failed for ${user.email}`);
  vi.spyOn(clientSession(), "getAccessToken").mockResolvedValue(tokens.access_token);
  return tokens.access_token;
}

/** A query client for tests: no retries, no background refetching. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Renders `ui` signed in as `user`, against the fake erp-api. */
export function renderAs(user: FakeUser, ui: ReactNode, client = testQueryClient()) {
  signInAs(user);
  return { client, ...render(ui, { wrapper: wrapperFor(client) }) };
}

/** Runs `hook` signed in as `user`, against the fake erp-api. */
export function renderHookAs<T>(user: FakeUser, hook: () => T, client = testQueryClient()) {
  signInAs(user);
  return { client, ...renderHook(hook, { wrapper: wrapperFor(client) }) };
}
