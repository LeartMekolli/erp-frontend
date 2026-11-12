import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { idempotencyHeader } from "@/lib/api/idempotency";

import { FAKE_API_URL } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import { STILL_WORKING, useApiMutation } from "./use-api-mutation";

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
    headers: { "content-type": "application/json", ...idempotencyHeader(key) },
    body: JSON.stringify(vars),
  });
  if (!response.ok) throw new Error(`roles answered ${response.status}`);
  return response.json();
}

function renderMutation(mutate: (vars: Vars, key: string) => Promise<unknown> = send) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useApiMutation(mutate), { wrapper });
}

/** erp-api's 409 for a key it can't use (`idempotency.service.ts:17-18`). */
const conflict = (code: string, detail: string) => ({ type: "about:blank", title: "Conflict", status: 409, code, detail });

/** A mutate that answers each call in turn: a problem to reject with, or a value to resolve to. */
function scripted(answers: unknown[]) {
  const keys: string[] = [];
  const mutate = (_vars: Vars, key: string) => {
    keys.push(key);
    const answer = answers.shift();
    return typeof answer === "object" && answer !== null && "code" in answer ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { keys, mutate };
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

  it("keeps the key and says it's still working on idempotency_in_progress", async () => {
    const { keys, mutate } = scripted([conflict("idempotency_in_progress", "A request with this key is in progress"), "ok"]);
    const { result } = renderMutation(mutate);
    let failure: unknown;
    await act(async () => {
      failure = await result.current.mutateAsync({ name: "Packers" }).catch((error: unknown) => error);
    });
    expect(failure).toMatchObject({ status: 409, detail: STILL_WORKING });
    await attempt(result.current.mutateAsync({ name: "Packers" }));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("sends once more with a new key on idempotency_key_reused", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { keys, mutate } = scripted([conflict("idempotency_key_reused", "Idempotency key reused with a different request"), "ok"]);
    const { result } = renderMutation(mutate);
    let data: unknown;
    await act(async () => {
      data = await result.current.mutateAsync({ name: "Packers" });
    });
    expect(data).toBe("ok");
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("doesn't retry a second key_reused", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reused = () => conflict("idempotency_key_reused", "Idempotency key reused with a different request");
    const { keys, mutate } = scripted([reused(), reused(), "never"]);
    const { result } = renderMutation(mutate);
    let failure: unknown;
    await act(async () => {
      failure = await result.current.mutateAsync({ name: "Packers" }).catch((error: unknown) => error);
    });
    expect(failure).toMatchObject({ code: "idempotency_key_reused" });
    expect(keys).toHaveLength(2);
    logged.mockRestore();
  });
});
