import type { ReactNode } from "react";

import { SessionGate } from "@/components/session/session-gate";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <SessionGate area="staff">{children}</SessionGate>;
}
