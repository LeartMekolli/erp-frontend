import { useId, type ReactNode } from "react";

/**
 * One white panel of the New order page. With a `title` it is a labelled region, with `action` (a link
 * or button such as "Replace file") at the right of the title; without one it is plain content.
 */
export function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={title ? headingId : undefined} className="flex flex-col gap-4 rounded-[20px] bg-card px-4 py-5 sm:px-5">
      {title && (
        <div className="flex items-center justify-between gap-3">
          <h2 id={headingId} className="text-[15px] font-semibold text-ink">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
