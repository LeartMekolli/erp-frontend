import type { Metadata } from "next";

import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";

export const metadata: Metadata = { title: "Accept your invitation · AMI" };

export default function AcceptInvitationPage() {
  return <AcceptInvitationForm />;
}
