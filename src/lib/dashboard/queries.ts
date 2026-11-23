"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { DashboardRange, DashboardResponse } from "@/lib/api/schema-types";
import { useApiMutation } from "@/lib/query/use-api-mutation";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  dashboard: () => ["dashboard", "week"] as const,
  range: (from: string, to: string) => ["dashboard", "range", from, to] as const,
};

/** How often the dashboard is read again while someone has it open. */
const DASHBOARD_POLL_MS = 60_000;

/** How often it is read again while the AI is still writing a briefing. */
const BRIEFING_POLL_MS = 3_000;

/**
 * This week against last week, what needs attention, the pieces in production and the AI briefing.
 * Read again every minute and when the window gets focus, and every few seconds while a briefing is being written.
 */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.dashboard(),
    queryFn: async (): Promise<DashboardResponse> => {
      const { data, error, response } = await api.GET("/reports/dashboard");
      if (!data) throw problemFrom(error, response);
      return data;
    },
    refetchInterval: (query) => {
      const ai = query.state.data?.ai;
      return ai && ai.enabled && ai.pending ? BRIEFING_POLL_MS : DASHBOARD_POLL_MS;
    },
    refetchOnWindowFocus: true,
  });
}

/** The numbers for the days from `from` to `to`, both included. While another range loads, the last one stays. */
export function useDashboardRange(range: { from: string; to: string }) {
  const { from, to } = range;
  return useQuery({
    queryKey: dashboardKeys.range(from, to),
    queryFn: async (): Promise<DashboardRange> => {
      const { data, error, response } = await api.GET("/reports/range", { params: { query: { from, to } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

/** Has the AI write a new briefing now; it is written in the background, so the dashboard is read again to show it. */
export function useWriteBriefing() {
  const client = useQueryClient();
  return useApiMutation<void, { id: string }>(
    async (_, key) => {
      const { data, error, response } = await api.POST("/reports/dashboard/briefing", { params: { header: idempotencyHeader(key) } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => client.invalidateQueries({ queryKey: dashboardKeys.dashboard() }) },
  );
}

/** Dismisses a suggestion of the briefing for the whole workspace, for 14 days. */
export function useDismissSuggestion() {
  const client = useQueryClient();
  return useApiMutation<string, void>(
    async (id, key) => {
      const { error, response } = await api.POST("/reports/dashboard/suggestions/{id}/dismiss", {
        params: { path: { id }, header: idempotencyHeader(key) },
      });
      if (!response.ok) throw problemFrom(error, response);
    },
    { onSettled: () => client.invalidateQueries({ queryKey: dashboardKeys.dashboard() }) },
  );
}

/** Takes a dismissal back, so its suggestion can come again. */
export function useUndoDismissal() {
  const client = useQueryClient();
  return useApiMutation<string, void>(
    async (id) => {
      const { error, response } = await api.DELETE("/reports/dashboard/dismissals/{id}", { params: { path: { id } } });
      if (!response.ok) throw problemFrom(error, response);
    },
    { onSettled: () => client.invalidateQueries({ queryKey: dashboardKeys.dashboard() }) },
  );
}
