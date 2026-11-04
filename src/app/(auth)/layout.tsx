import type { ReactNode } from "react";

import { AuthPanels } from "@/components/auth/auth-panels";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthPanels>{children}</AuthPanels>;
}
