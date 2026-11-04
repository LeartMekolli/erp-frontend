import type { Metadata } from "next";

import { PartnerChooser } from "@/components/session/landing";

export const metadata: Metadata = { title: "Choose a workshop · AMI" };

export default function PartnerChooserPage() {
  return <PartnerChooser />;
}
