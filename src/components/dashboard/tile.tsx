import { useId, type ReactNode } from "react";

import { cn } from "cn";

export type TileSpan = 3 | 4 | 5 | 6 | 8 | 12;

/**
 * Columns on the 12-column desktop bento and the 6-column tablet one. Phones have two columns: a
 * 3-wide tile (a KPI) takes one, so KPIs sit two across; every other tile takes both.
 */
const SPAN: Record<TileSpan, string> = {
  3: "col-span-1 md:col-span-3 lg:col-span-3",
  4: "col-span-2 md:col-span-3 lg:col-span-4",
  5: "col-span-2 md:col-span-6 lg:col-span-5",
  6: "col-span-2 md:col-span-6 lg:col-span-6",
  8: "col-span-2 md:col-span-6 lg:col-span-8",
  12: "col-span-2 md:col-span-6 lg:col-span-12",
};

const TONE = {
  plain: "bg-card text-ink",
  lilac: "bg-linear-120 from-lilac via-[#f4f1ff] to-[#e3dcfb] text-violet-ink",
  dark: "bg-ink text-white",
} as const;

/** One tile of the dashboard's bento: a titled section, white, lilac or the dark hero. */
export function Tile({
  title,
  aside,
  span,
  rows,
  tone = "plain",
  className,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  span: TileSpan;
  rows?: 2;
  tone?: keyof typeof TONE;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col rounded-[20px] px-5 py-[18px]", SPAN[span], rows === 2 && "lg:row-span-2", TONE[tone], className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={id} className={cn("text-[13px]", tone === "dark" ? "text-[#b9b6c9]" : tone === "lilac" ? "font-semibold" : "text-ink-2")}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
