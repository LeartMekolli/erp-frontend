import type { Metadata } from "next";

import { JobPage } from "@/components/partner/job-page";

export const metadata: Metadata = { title: "Job · AMI" };

export default function WorkshopJobPage() {
  return <JobPage />;
}
