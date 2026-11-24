"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";

import { partnerApi } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import type { CapacityRow, PartnerJobCounts, PartnerScoreResponse, PartnerSetup, PartnerSummary } from "@/lib/api/schema-types";

/** Every key starts with the workshop, so someone working for two never sees one's numbers on the other's page. */
export const partnerDashboardKeys = {
  all: (partnerId: string) => ["partner-dashboard", partnerId] as const,
  summary: (partnerId: string, from: string, to: string) => ["partner-dashboard", partnerId, "summary", from, to] as const,
  counts: (partnerId: string) => ["partner-dashboard", partnerId, "counts"] as const,
  score: (partnerId: string) => ["partner-dashboard", partnerId, "score"] as const,
  setup: (partnerId: string) => ["partner-dashboard", partnerId, "setup"] as const,
  capacity: (partnerId: string, from: string, to: string) => ["partner-dashboard", partnerId, "capacity", from, to] as const,
};

/** How often the dashboard is read again while someone has it open, as the staff dashboard. */
const DASHBOARD_POLL_MS = 60_000;

/**
 * While another range loads, the last one stays on screen, but only the same workshop's: a person working
 * for two never sees one workshop's numbers, even dimmed, on the other's page.
 */
function sameWorkshopsLast<T>(partnerId: string) {
  return (previous: T | undefined, query: { queryKey: QueryKey } | undefined) => (query?.queryKey[1] === partnerId ? previous : undefined);
}

/** A range of days, both included, in the workspace's calendar. */
export interface DayRange {
  from: string;
  to: string;
}

/**
 * Jobs finished in the range and the period before, and the pieces at the workshop's steps now. The money
 * (`earned`, `previous_earned`, `currency`) is there only for admins and owners. While another range loads,
 * the last one stays.
 */
export function usePartnerSummary(partnerId: string, { from, to }: DayRange) {
  return useQuery({
    queryKey: partnerDashboardKeys.summary(partnerId, from, to),
    queryFn: async (): Promise<PartnerSummary> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/summary", {
        params: { path: { partnerId }, query: { from, to } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    placeholderData: sameWorkshopsLast<PartnerSummary>(partnerId),
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** Pieces waiting and the capacity at each step, a row per day and step, oldest day first. The last range stays while another loads. */
export function usePartnerCapacity(partnerId: string, { from, to }: DayRange) {
  return useQuery({
    queryKey: partnerDashboardKeys.capacity(partnerId, from, to),
    queryFn: async (): Promise<CapacityRow[]> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/capacity-history", {
        params: { path: { partnerId }, query: { from, to } },
      });
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
    placeholderData: sameWorkshopsLast<CapacityRow[]>(partnerId),
    refetchOnWindowFocus: true,
  });
}

/** How many jobs are offered, in progress, finished, late and due soon, right now. */
export function usePartnerJobCounts(partnerId: string) {
  return useQuery({
    queryKey: partnerDashboardKeys.counts(partnerId),
    queryFn: async (): Promise<PartnerJobCounts> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/counts", {
        params: { path: { partnerId } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** The workshop's score as staff see it, and its 50 newest ratings. */
export function usePartnerScore(partnerId: string) {
  return useQuery({
    queryKey: partnerDashboardKeys.score(partnerId),
    queryFn: async (): Promise<PartnerScoreResponse> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/score", {
        params: { path: { partnerId } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** The workshop's setup: the steps it can do, its closed days and the option values it offers. */
export function usePartnerSetup(partnerId: string) {
  return useQuery({
    queryKey: partnerDashboardKeys.setup(partnerId),
    queryFn: async (): Promise<PartnerSetup> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/setup", {
        params: { path: { partnerId } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}
