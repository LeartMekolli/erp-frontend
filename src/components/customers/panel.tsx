import { cn } from "cn";
import { useId, type ReactNode } from "react";

/** A white panel on the customer's page, its title an h2, with room for the panel's own Edit. */
export function Panel({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col rounded-[20px] bg-card p-4 md:p-5", className)}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
        <h2 id={id} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A panel's placeholder while it loads. */
export function PanelLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {[0, 1, 2].map((n) => (
        <div key={n} aria-hidden className="h-5 animate-pulse rounded-md bg-ground motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/** One fact: its name above or beside its value. */
export function Fact({ term, inline = false, children }: { term: string; inline?: boolean; children: ReactNode }) {
  return (
    <div className={cn(inline && "flex items-baseline justify-between gap-3")}>
      <dt className="text-caption text-ink-2">{term}</dt>
      <dd className={cn("text-sm text-ink", inline ? "text-right" : "mt-0.5")}>{children}</dd>
    </div>
  );
}
