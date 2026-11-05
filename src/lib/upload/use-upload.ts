"use client";

import { useEffect, useRef, useState } from "react";

import { usePolledJob } from "@/lib/query/use-polled-job";
import { OfflineError } from "@/lib/session/client-session";

import {
  APP_CLIENTS,
  UploadExpiredError,
  UploadMismatchError,
  UploadNetworkError,
  UploadRefusedError,
  completeUpload,
  putToStorage,
  readFile,
  startUpload,
  versionState,
  type UploadClients,
  type UploadTarget,
} from "./upload";

export type UploadPhase = "idle" | "uploading" | "completing" | "measuring" | "done" | "failed" | "expired";

interface Run {
  step: Exclude<UploadPhase, "done">;
  progress: number;
  fileId?: string;
  versionId?: string;
  message: string | null;
}

const IDLE: Run = { step: "idle", progress: 0, message: null };

/** How a failed run reads: expired has its own state; the rest say why when AMI knows. */
function failure(error: unknown): Pick<Run, "step" | "message"> {
  if (error instanceof UploadExpiredError) return { step: "expired", message: null };
  if (error instanceof OfflineError) return { step: "failed", message: new UploadNetworkError().message };
  if (
    error instanceof UploadMismatchError ||
    error instanceof UploadNetworkError ||
    error instanceof UploadRefusedError
  )
    return { step: "failed", message: error.message };
  return { step: "failed", message: null };
}

/**
 * One file's upload: start it with erp-api, PUT the bytes to storage, complete
 * it, then follow the measuring until the version is ready. Leaving the page
 * stops the PUT. `retry()` starts again with a new file, so nothing half-sent
 * is reused.
 */
export function useUpload(target: UploadTarget, options: { clients?: UploadClients } = {}) {
  const clients = options.clients ?? APP_CLIENTS;
  const [run, setRun] = useState<Run>(IDLE);
  const lastFile = useRef<File | null>(null);
  const running = useRef<AbortController | null>(null);

  // Leaving the page stops whatever run is going then; `stop` is the ref itself, not a node React swaps.
  useEffect(() => {
    const stop = running;
    return () => stop.current?.abort();
  }, []);

  function upload(file: File) {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    lastFile.current = file;
    setRun({ step: "uploading", progress: 0, message: null });

    // A run that was replaced or stopped no longer updates the state.
    const update = (next: Partial<Run>) => {
      if (!controller.signal.aborted) setRun((current) => ({ ...current, ...next }));
    };

    void (async () => {
      try {
        const started = await startUpload(clients, target, file);
        update({ fileId: started.fileId, versionId: started.versionId });
        await putToStorage(started.upload, file, {
          onProgress: (progress) => update({ progress }),
          signal: controller.signal,
        });
        update({ step: "completing", progress: 1 });
        await completeUpload(clients, target, started.fileId, started.versionId);
        update({ step: "measuring" });
      } catch (error) {
        update(failure(error));
      }
    })();
  }

  function retry() {
    if (lastFile.current) upload(lastFile.current);
  }

  function reset() {
    running.current?.abort();
    running.current = null;
    lastFile.current = null;
    setRun(IDLE);
  }

  const { fileId, versionId } = run;
  const job = usePolledJob({
    queryKey: ["upload", target.area, fileId],
    queryFn: () => readFile(clients, target, fileId ?? ""),
    stateOf: (file) => versionState(file.versions.find((v) => v.id === versionId)?.status ?? "missing"),
    enabled: run.step === "measuring" && fileId !== undefined,
  });

  let phase: UploadPhase = run.step;
  if (run.step === "measuring" && job.state === "done") phase = "done";
  else if (run.step === "measuring" && (job.state === "failed" || job.state === "expired")) phase = "failed";

  return {
    upload,
    retry,
    reset,
    phase,
    progress: run.progress,
    fileId,
    versionId,
    slow: phase === "measuring" && job.slow,
    offline: job.offline,
    message: run.message,
  };
}
