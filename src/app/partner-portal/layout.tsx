import type { ReactNode } from "react";

import { SessionGate } from "@/components/session/session-gate";

export default function PartnerPortalLayout({ children }: { children: ReactNode }) {
  return <SessionGate area="partner">{children}</SessionGate>;
}
