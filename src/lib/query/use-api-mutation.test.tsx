import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { idempotent } from "@/lib/api/idempotency";

import { FAKE_API_URL } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import { useApiMutation } from "./use-api-mutation";

type Vars = Record<string, unknown>;

/** A one-off POST /roles that records each Idempotency-Key; "fail" answers with a network error. */
function serve(outcomes: ("fail" | "ok")[] = []) {
  const keys: (string | null)[] = [];
  server.use(
    http.post(`${FAKE_API_URL}/roles`, ({ request }) => {
      keys.push(request.headers.get("idempotency-key"));
      return outcomes.shift() === "fail" ? HttpResponse.error() : HttpResponse.json({ ok: true }, { status: 201 });
    }),
  );
  return keys;
}

async function send(vars: Vars, key: string): Promise<unknown> {
  const response = await fetch(`${FAKE_API_URL}/roles`, {
    method: "POST",
    headers: { "content-type": "application/json", ...idempotent(key).headers },
    body: JSON.stringify(vars),
  });
  if (!response.ok) throw new Error(`roles answered ${response.status}`);
  return response.json();
}

function renderMutation() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useApiMutation(send), { wrapper });
}

const attempt = (promise: Promise<unknown>) => act(async () => void (await promise.catch(() => undefined)));

describe("useApiMutation", () => {
  it("sends one request for a double-click", async () => {
    const keys = serve();
    const { result } = renderMutation();
    act(() => {
      result.current.mutate({ name: "Packers" });
      result.current.mutate({ name: "Packers" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keys).toHaveLength(1);
  });

  it("reuses the key after a network failure", async () => {
    const keys = serve(["fail", "ok"]);
    const { result } = renderMutation();
    await attempt(result.current.mutateAsync({ name: "Packers" }));
    await attempt(result.current.mutateAsync({ name: "Packers" }));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("uses a new key for changed input", async () => {
    const keys = serve(["fail", "ok"]);
    const { result } = renderMutation();
    await attempt(result.current.mutateAsync({ name: "Packers" }));
    await attempt(result.current.mutateAsync({ name: "Shippers" }));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("uses a new key after a success", async () => {
    const keys = serve();
    const { result } = renderMutation();
    await attempt(result.current.mutateAsync({ name: "Packers" }));
    await attempt(result.current.mutateAsync({ name: "Packers" }));
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("treats reordered keys as the same input", async () => {
    const keys = serve(["fail", "ok"]);
    const { result } = renderMutation();
    await attempt(result.current.mutateAsync({ a: 1, b: { c: 2, d: 3 } }));
    await attempt(result.current.mutateAsync({ b: { d: 3, c: 2 }, a: 1 }));
    expect(keys[1]).toBe(keys[0]);
  });
});
