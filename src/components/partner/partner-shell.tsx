"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

import { PartnerNoticeLine, PartnerNoticeProvider } from "./notice";
import { PartnerSidebar } from "./partner-sidebar";
import { PartnerTopBar } from "./partner-top-bar";
import { useWorkshop } from "./use-workshop";

export { useWorkshop } from "./use-workshop";

/**
 * Under the top bar: the suspended banner while it applies, and the notice
 * line. Both live regions stay mounted, so what appears in them is read; empty,
 * they take no room.
 */
function Banner() {
  const { suspended } = useWorkshop();
  return (
    <>
      <div role="status">
        {suspended && (
          <div className="mx-3 mb-2 flex items-start gap-2 rounded-xl bg-card px-4 py-3 text-sm text-ink sm:mx-5">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
            <p>Your workshop is suspended. You can finish the jobs you have, but you can&apos;t take new ones.</p>
          </div>
        )}
      </div>
      <PartnerNoticeLine className="mx-3 sm:mx-5" />
    </>
  );
}

/** The partner frame: the shared shell with the partner's sidebar and top bar. */
export function PartnerShell({ children }: { children: ReactNode }) {
  return (
    <PartnerNoticeProvider>
      <AppShell
        sidebar={(props) => <PartnerSidebar {...props} />}
        topBar={(onOpenMenu) => <PartnerTopBar onOpenMenu={onOpenMenu} />}
        banner={<Banner />}
      >
        {children}
      </AppShell>
    </PartnerNoticeProvider>
  );
}
