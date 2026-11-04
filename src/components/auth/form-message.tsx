import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A message above a form. Errors are announced at once (`alert`), notes politely (`status`). */
export function FormMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3.5 py-3 text-sm",
        tone === "error" ? "bg-late/8 text-late" : "bg-lilac text-violet-ink",
      )}
    >
      {children}
    </div>
  );
}
