"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface LeaveGuard {
  /** Goes to `href` at once when nothing is entered; otherwise asks first. */
  requestLeave: (href: string) => void;
  dialog: { open: boolean; leave: () => void; stay: () => void };
}

/** The link a click would follow inside this app, or null for anything the browser should handle itself. */
function followedHref(event: MouseEvent): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return null;
  const link = event.target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return null;
  const target = link.getAttribute("target");
  if ((target && target !== "_self") || link.hasAttribute("download")) return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // The same page, or a jump within it, loses nothing.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * While `dirty`: the browser asks before the tab closes or reloads, and a click on a link inside AMI
 * opens the Leave dialog instead of following it.
 */
export function useLeaveGuard(dirty: boolean): LeaveGuard {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function onClick(event: MouseEvent) {
      const href = followedHref(event);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(href);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  function requestLeave(href: string) {
    if (dirtyRef.current) setPending(href);
    else router.push(href);
  }

  return {
    requestLeave,
    dialog: {
      open: pending !== null,
      leave() {
        if (pending === null) return;
        const href = pending;
        setPending(null);
        router.push(href);
      },
      stay() {
        setPending(null);
      },
    },
  };
}
