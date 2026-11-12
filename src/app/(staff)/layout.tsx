import type { ReactNode } from "react";

import { SessionGate } from "@/components/session/session-gate";
import { StaffShell } from "@/components/shell/staff-shell";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate area="staff">
      <StaffShell>{children}</StaffShell>
    </SessionGate>
  );
}
