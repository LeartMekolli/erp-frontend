import type { Metadata } from "next";

import { EarningsPage } from "@/components/partner/earnings/earnings-page";

export const metadata: Metadata = { title: "Earnings · AMI" };

export default function WorkshopEarningsPage() {
  return <EarningsPage />;
}
