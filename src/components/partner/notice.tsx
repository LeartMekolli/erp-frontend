"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface PartnerNotice {
  notice: ReactNode;
  announce: (notice: ReactNode) => void;
}

const NoticeContext = createContext<PartnerNotice | null>(null);

/** Holds the one notice line of the partner shell, so it survives going from a Job page back to Jobs. */
export function PartnerNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, announce] = useState<ReactNode>(null);
  const value = useMemo(() => ({ notice, announce }), [notice]);
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
}

export function usePartnerNotice(): PartnerNotice {
  const value = useContext(NoticeContext);
  if (!value) throw new Error("usePartnerNotice needs a PartnerNoticeProvider");
  return value;
}
