"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

import { PartnerNoticeProvider, usePartnerNotice } from "./notice";
import { PartnerSidebar } from "./partner-sidebar";
import { PartnerTopBar } from "./partner-top-bar";
import { useWorkshop } from "./use-workshop";

export { useWorkshop } from "./use-workshop";

/** Under the top bar: the suspended banner while it applies, and the notice line, hidden while empty. */
function Banner() {
  const { suspended } = useWorkshop();
  const { notice } = usePartnerNotice();
  return (
    <>
      {suspended && (
        <div role="status" className="mx-3 mb-2 flex items-start gap-2 rounded-xl bg-card px-4 py-3 text-sm text-ink sm:mx-5">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-collect" />
          <p>Your workshop is suspended. You can finish the jobs you have, but you can&apos;t take new ones.</p>
        </div>
      )}
      <p role="status" className="mx-3 text-sm text-ink-2 empty:hidden sm:mx-5">
        {notice}
      </p>
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
