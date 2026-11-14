import type { Metadata } from "next";

import { JobsPage } from "@/components/partner/jobs-page";

export const metadata: Metadata = { title: "Jobs · AMI" };

export default function WorkshopJobsPage() {
  return <JobsPage />;
}
