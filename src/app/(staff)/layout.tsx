import type { ReactNode } from "react";

import { SessionGate } from "@/components/session/session-gate";
import { AppShell } from "@/components/shell/app-shell";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate area="staff">
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
