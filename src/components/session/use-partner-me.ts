"use client";

import { useQuery } from "@tanstack/react-query";

import { partnerApi } from "@/lib/api/client";
import type { PartnerMeResponse } from "@/lib/api/schema-types";

/** `GET /partner-portal/me`: the partners this person works for, by name, with their role at each. */
export function usePartnerMe() {
  return useQuery({
    queryKey: ["partner-portal", "me"],
    queryFn: async (): Promise<PartnerMeResponse> => {
      const { data, response } = await partnerApi.GET("/partner-portal/me");
      if (!data) throw new Error(`/partner-portal/me answered ${response.status}`);
      return data;
    },
  });
}
