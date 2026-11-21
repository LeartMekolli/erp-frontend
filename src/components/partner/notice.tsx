"use client";

import { cn } from "cn";
import { CircleCheck } from "lucide-react";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** One announcement. The id is new each time, so the same words twice still render, and are read, again. */
interface Notice {
  id: number;
  node: ReactNode;
  focus: boolean;
  tone: NoticeTone;
}

/** `success` is a win (a job taken, pieces moved): shown as a band with a check. */
export type NoticeTone = "plain" | "success";

interface PartnerNotice {
  notice: Notice | null;
  /** Shows `node` in the notice line; `focus` also moves focus there, for when what had it is gone. */
  announce: (node: ReactNode, options?: { focus?: boolean; tone?: NoticeTone }) => void;
}

const NoticeContext = createContext<PartnerNotice | null>(null);

/** Holds the one notice line of the partner shell, so it survives going from a Job page back to Jobs. */
export function PartnerNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const announce = useCallback((node: ReactNode, { focus = false, tone = "plain" }: { focus?: boolean; tone?: NoticeTone } = {}) => {
    setNotice((last) => ({ id: (last?.id ?? 0) + 1, node, focus, tone }));
  }, []);
  const value = useMemo(() => ({ notice, announce }), [notice, announce]);
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
}

export function usePartnerNotice(): PartnerNotice {
  const value = useContext(NoticeContext);
  if (!value) throw new Error("usePartnerNotice needs a PartnerNoticeProvider");
  return value;
}

/**
 * The notice line itself: a live region that is always there, so the first
 * notice is read too, and that takes no room while empty. It takes focus when
 * a notice asks for it, like `<main>` does for the skip link, without a ring.
 */
export function PartnerNoticeLine({ className }: { className?: string }) {
  const { notice } = usePartnerNotice();
  const line = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (notice?.focus) line.current?.focus();
  }, [notice]);

  return (
    <p ref={line} role="status" tabIndex={-1} className={cn("text-sm text-ink-2 outline-none", className)}>
      {notice &&
        (notice.tone === "success" ? (
          // Order detail's "Order placed" band, with a check so a win doesn't rest on colour.
          <span key={notice.id} data-tone="success" className="mb-2 flex items-start gap-2 rounded-lg bg-lilac px-3.5 py-3 text-sm text-violet-ink">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{notice.node}</span>
          </span>
        ) : (
          <Fragment key={notice.id}>{notice.node}</Fragment>
        ))}
    </p>
  );
}
