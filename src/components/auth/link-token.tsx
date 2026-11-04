"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

import { takeFragmentToken } from "@/lib/auth/fragment-token";

type Render = (token: string | null) => ReactNode;

const noSubscribe = () => () => {};

/**
 * Renders `children` with the token from an erp-api email link (`#token=…`),
 * taken out of the address on the first render, before any request. Browser
 * only: the fragment never reaches the server.
 */
export function WithLinkToken({ children }: { children: Render }) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  return inBrowser ? <TakeToken>{children}</TakeToken> : null;
}

function TakeToken({ children }: { children: Render }) {
  // React keeps the first result when Strict Mode calls the initialiser twice.
  const [token] = useState(takeFragmentToken);
  return children(token);
}
