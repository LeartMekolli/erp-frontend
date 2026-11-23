import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CLERK, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { dashboardKeys, useDashboard, useDashboardRange, useDismissSuggestion, useUndoDismissal, useWriteBriefing } from "./queries";

afterEach(() => server.events.removeAllListeners());

const FIRST = { from: "2026-10-01", to: "2026-10-31" };
const SECOND = { from: "2026-09-01", to: "2026-09-30" };

describe("dashboard queries", () => {
  it("reads this week's dashboard", async () => {
    const { result } = renderHookAs(STAFF, () => useDashboard());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.attention.length).toBeGreaterThan(0);
    expect(result.current.data?.ai).toMatchObject({ enabled: true });
  });

  it("reads again every minute, and every 3 seconds while a briefing is being written", async () => {
    const { result, client } = renderHookAs(STAFF, () => useDashboard());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    if (!data.ai?.enabled) throw new Error("expected AI on");

    const query = client.getQueryCache().find({ queryKey: dashboardKeys.dashboard() })!;
    const interval = query.observers[0]!.options.refetchInterval as unknown as (query: unknown) => number | false | undefined;
    expect(interval(query)).toBe(60_000);

    client.setQueryData(dashboardKeys.dashboard(), { ...data, ai: { ...data.ai, pending: true } });
    expect(interval(query)).toBe(3_000);

    client.setQueryData(dashboardKeys.dashboard(), { ...data, ai: { enabled: false, reason: "limit_used" } });
    expect(interval(query)).toBe(60_000);

    client.setQueryData(dashboardKeys.dashboard(), { ...data, ai: undefined });
    expect(interval(query)).toBe(60_000);
  });

  it("reports a refusal for staff who may not read reports", async () => {
    const { result } = renderHookAs(CLERK, () => useDashboard());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 403 });
  });

  it("keeps the previous range on screen while a new one loads", async () => {
    let range = FIRST;
    const { result, rerender } = renderHookAs(STAFF, () => useDashboardRange(range));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.range).toMatchObject(FIRST);
    expect(result.current.isPlaceholderData).toBe(false);

    range = SECOND;
    rerender();

    expect(result.current.data?.range).toMatchObject(FIRST);
    expect(result.current.isPlaceholderData).toBe(true);
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.range).toMatchObject(SECOND);
  });

  it("keeps each range under its own key", async () => {
    const { result, client } = renderHookAs(STAFF, () => useDashboardRange(FIRST));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(dashboardKeys.range(FIRST.from, FIRST.to))).toBeDefined();
    expect(client.getQueryData(dashboardKeys.range(SECOND.from, SECOND.to))).toBeUndefined();
  });

  it("asks for a briefing with a retry key and reads the dashboard again", async () => {
    const keys: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/reports/dashboard/briefing")) keys.push(request.headers.get("idempotency-key"));
    });
    const { result } = renderHookAs(STAFF, () => ({ dashboard: useDashboard(), write: useWriteBriefing() }));
    await waitFor(() => expect(result.current.dashboard.isSuccess).toBe(true));
    expect(result.current.dashboard.data?.ai).toMatchObject({ enabled: true, pending: false });

    await act(() => result.current.write.mutateAsync());

    expect(keys).toHaveLength(1);
    expect(keys[0]).toBeTruthy();
    await waitFor(() => expect(result.current.dashboard.data?.ai).toMatchObject({ enabled: true, pending: true }));
  });

  it("dismisses a suggestion and takes the dismissal back", async () => {
    const { result } = renderHookAs(STAFF, () => ({ dashboard: useDashboard(), dismiss: useDismissSuggestion(), undo: useUndoDismissal() }));
    const suggestions = () => {
      const ai = result.current.dashboard.data?.ai;
      return ai?.enabled && ai.briefing ? ai.briefing.suggestions : [];
    };
    const dismissals = () => {
      const ai = result.current.dashboard.data?.ai;
      return ai?.enabled ? ai.dismissed : [];
    };
    await waitFor(() => expect(suggestions().length).toBeGreaterThan(0));
    const total = suggestions().length;
    const first = suggestions()[0]!.id;

    await act(() => result.current.dismiss.mutateAsync(first));
    await waitFor(() => expect(suggestions()).toHaveLength(total - 1));
    expect(dismissals()).toHaveLength(1);

    await act(() => result.current.undo.mutateAsync(dismissals()[0]!.id));
    await waitFor(() => expect(suggestions()).toHaveLength(total));
    expect(dismissals()).toHaveLength(0);
  });
});
