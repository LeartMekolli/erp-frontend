import type { Metadata } from "next";

import { PartnerDashboardPage } from "@/components/partner/dashboard/dashboard-page";

export const metadata: Metadata = { title: "Dashboard · AMI" };

export default function WorkshopDashboardPage() {
  return <PartnerDashboardPage />;
}
