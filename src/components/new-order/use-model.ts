"use client";

import { useEffect, useRef, useState } from "react";

import { useCan } from "@/lib/auth/permissions";
import type { NewOrderValues } from "@/lib/new-order/form";
import { useUpload } from "@/lib/upload/use-upload";

export type ModelUpload = ReturnType<typeof useUpload>;

/**
 * The order's 3D model: it holds the dropped file and uploads it once there is a customer, since a
 * design belongs to one. Another customer or another unit uploads it again (both are baked into the
 * uploaded version); removing the file or clearing the customer drops the upload. A product change
 * leaves it alone.
 *
 * `readyVersionId` is what the page quotes from: the version once measured, undefined until then. It is
 * also undefined when the run that made it started for another customer or unit than the current ones.
 * That holds in the very render where the customer or unit changed, before the effect below has started
 * the new run, so no quote can go out with the old customer's or unit's version.
 */
export function useModel({ customerId, declaredUnit }: { customerId: string; declaredUnit: NewOrderValues["declaredUnit"] }) {
  const canUpload = useCan("file.write");
  const [held, setHeld] = useState<File | null>(null);
  const upload: ModelUpload = useUpload({ area: "staff", kind: "design", customerId: customerId || undefined, declaredUnit });

  // The effect below starts uploads only when its inputs change, so it reads the latest upload from a ref
  // (whose functions close over this render's customer and unit) instead of depending on it.
  const latestUpload = useRef(upload);
  useEffect(() => {
    latestUpload.current = upload;
  });

  // Runs when the file, customer, unit or permission changes, never on a plain re-render, so one change
  // starts one upload. `upload()` stops a run still going, so a unit change mid-upload starts over and
  // the first run's progress never reaches the second.
  useEffect(() => {
    const current = latestUpload.current;
    if (!held || customerId === "") {
      if (current.phase !== "idle") current.reset();
      return;
    }
    if (canUpload) current.upload(held);
  }, [held, customerId, declaredUnit, canUpload]);

  const forCurrent = upload.startedFor?.customerId === (customerId || undefined) && upload.startedFor?.declaredUnit === declaredUnit;

  return {
    held,
    readyVersionId: upload.phase === "done" && forCurrent ? upload.versionId : undefined,
    /** The upload failed or its link ran out: the file is held but there is nothing to quote with. */
    failed: upload.phase === "failed" || upload.phase === "expired",
    choose: (file: File) => setHeld(file),
    remove: () => setHeld(null),
    upload,
    waitingForCustomer: held !== null && customerId === "",
    canUpload,
  };
}
