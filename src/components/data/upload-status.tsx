"use client";

import { Button } from "@/components/ui/button";
import type { JobState } from "@/lib/query/use-polled-job";
import type { UploadPhase, useUpload } from "@/lib/upload/use-upload";

import { JobStatus } from "./job-status";

const STATE: Record<Exclude<UploadPhase, "idle">, JobState> = {
  uploading: "working",
  completing: "working",
  measuring: "working",
  done: "done",
  failed: "failed",
  expired: "expired",
};

const WORKING: Record<"uploading" | "completing" | "measuring", (percent: number) => string> = {
  uploading: (percent) => `Uploading… ${percent}%`,
  completing: () => "Checking the upload…",
  measuring: () => "Measuring…",
};

/** Where one file's upload is, with a way to try again when it didn't make it. */
export function UploadStatus({ upload }: { upload: ReturnType<typeof useUpload> }) {
  const { phase, progress, message, slow, offline, retry } = upload;
  if (phase === "idle") return null;

  const percent = Math.round(progress * 100);
  const working = phase === "uploading" || phase === "completing" || phase === "measuring";
  const label = working ? WORKING[phase](percent) : "";
  const labels: Record<JobState, string> = {
    pending: label,
    working: label,
    done: "Ready",
    failed: "Upload failed.",
    expired: "The upload link ran out before the file arrived.",
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <JobStatus state={STATE[phase]} labels={labels} slow={slow} offline={offline} />
      {phase === "uploading" && (
        <progress value={percent} max={100} aria-label="Upload progress" className="h-1 w-full accent-violet" />
      )}
      {message && <p className="text-sm text-ink-2">{message}</p>}
      {(phase === "failed" || phase === "expired") && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
