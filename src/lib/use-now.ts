"use client";

import { useEffect, useState } from "react";

/** `Date.now()`, read again every `tickMs`, so a screen can word time that passes. */
export function useNow(tickMs: number): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return now;
}
