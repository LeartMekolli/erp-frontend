import type { ReactNode } from "react";

/**
 * Layout B1: the form on a white panel, and a calm, flat panel beside it.
 * Below 1024px the side panel goes and the form stands alone on the grey.
 */
export function AuthPanels({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh gap-3.5 p-3.5 pt-[max(14px,env(safe-area-inset-top))] pr-[max(14px,env(safe-area-inset-right))] pb-[max(14px,env(safe-area-inset-bottom))] pl-[max(14px,env(safe-area-inset-left))]">
      <section className="mx-auto flex w-full max-w-[560px] flex-col rounded-[20px] bg-card px-6 py-7 sm:px-14 lg:mx-0 lg:max-w-none lg:shrink-0 lg:basis-[44%]">
        <div className="flex items-center gap-2.5 text-[17px] font-bold">
          {/* Stand-in mark until AMI has a logo. */}
          <span aria-hidden="true" className="grid size-[30px] place-items-center rounded-[9px] bg-ink text-[13px] text-white">
            A
          </span>
          AMI
        </div>
        <main className="my-auto w-full max-w-[360px] py-10">{children}</main>
        <p className="text-[13px] text-ink-2">Ordering as a customer? Use your supplier&apos;s customer site.</p>
      </section>

      <aside className="hidden flex-1 flex-col justify-end rounded-[20px] bg-panel-soft px-11 py-10 lg:flex">
        <p className="max-w-[520px] text-[40px] leading-[1.08] font-semibold tracking-[-1.4px] text-balance">
          The workroom for your team <span className="text-violet-ink">and your partner workshops.</span>
        </p>
        <p className="mt-3.5 max-w-[440px] text-[15px] text-panel-soft-ink">
          Quotes, orders, production and payouts, on the same live data.
        </p>
      </aside>
    </div>
  );
}
