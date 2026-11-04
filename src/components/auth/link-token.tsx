"use client";

import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { clearFragment, readFragmentToken } from "@/lib/auth/fragment-token";

type Render = (token: string | null) => ReactNode;

const noSubscribe = () => () => {};

/**
 * Renders `children` with the token from an erp-api email link (`#token=…`)
 * and removes it from the address before any request. Browser only: the
 * fragment never reaches the server.
 */
export function WithLinkToken({ children }: { children: Render }) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  return inBrowser ? <TakeToken>{children}</TakeToken> : null;
}

function TakeToken({ children }: { children: Render }) {
  // Read while rendering (no side effects); kept in state once the address is cleared.
  const [token] = useState(readFragmentToken);
  // Layout effects all run before any passive effect, so the address is
  // clean before a child's request leaves.
  useLayoutEffect(clearFragment, []);
  return children(token);
}
