import { api, createApiClient, partnerApi } from "@/lib/api/client";
import { idempotencyHeader, newIdempotencyKey } from "@/lib/api/idempotency";
import { isApiProblem, type ApiProblem } from "@/lib/api/problem";
import type { PartnerPaths, paths } from "@/lib/api/schema-types";
import type { JobState } from "@/lib/query/use-polled-job";

type StartFileBody = paths["/files"]["post"]["requestBody"]["content"]["application/json"];
type FileResponse = paths["/files/{id}"]["get"]["responses"][200]["content"]["application/json"];

/** One thing the server measured on a file version (`type`, a decimal string `value`, its `unit`). */
export type FileMeasure = FileResponse["versions"][number]["measures"][number];

/** Where a file goes: a staff file of some kind, or a photo a workshop owns. */
export type UploadTarget =
  | {
      area: "staff";
      kind: StartFileBody["kind"];
      /** Required for a design: a mesh has no unit of its own. */
      declaredUnit?: NonNullable<StartFileBody["declared_unit"]>;
      customerId?: string;
    }
  | { area: "partner"; partnerId: string };

/** The clients uploads go through; tests pass ones signed in to the fake erp-api. */
export interface UploadClients {
  api: ReturnType<typeof createApiClient<paths>>;
  partnerApi: ReturnType<typeof createApiClient<PartnerPaths>>;
}

export const APP_CLIENTS: UploadClients = { api, partnerApi };

/** What a partner may upload (erp-api `files.controller.ts:31`). */
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * A file version's statuses (erp-api `files.service.ts:301-386`,
 * `measure.handler.ts:66-122`). A status erp-api adds fails the typecheck below.
 */
type VersionStatus = FileResponse["versions"][number]["status"];

const VERSION_STATE: Record<VersionStatus, JobState> = {
  pending: "working",
  completing: "working",
  uploaded: "working",
  measuring: "working",
  measured: "done",
  failed: "failed",
};

const reported = new Set<string>();

/** A version's status as background work; one AMI doesn't know is a failure, reported once. */
export function versionState(status: string): JobState {
  if (status in VERSION_STATE) return VERSION_STATE[status as VersionStatus];
  if (!reported.has(status)) {
    reported.add(status);
    console.error(`Unknown file version status: ${status}`);
  }
  return "failed";
}

export class UploadError extends Error {
  constructor(message = "Upload failed.") {
    super(message);
    this.name = "UploadError";
  }
}

/** erp-api turned the file down before any bytes were sent (its type or size). */
export class UploadRefusedError extends UploadError {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefusedError";
  }
}

/** The signed link ran out before the bytes arrived. */
export class UploadExpiredError extends UploadError {
  constructor() {
    super("The upload link ran out before the file arrived.");
    this.name = "UploadExpiredError";
  }
}

/** What reached storage isn't what was declared, or nothing did. */
export class UploadMismatchError extends UploadError {
  constructor() {
    super("The file changed while uploading.");
    this.name = "UploadMismatchError";
  }
}

/** The PUT to storage didn't get an answer. */
export class UploadNetworkError extends UploadError {
  constructor() {
    super("The upload stopped. Check your connection.");
    this.name = "UploadNetworkError";
  }
}

export interface SignedUpload {
  url: string;
  headers: Record<string, string>;
  expires_at: string;
}

export interface StartedUpload {
  fileId: string;
  versionId: string;
  upload: SignedUpload;
}

function problemOf(error: unknown, response: Response): ApiProblem {
  return isApiProblem(error) ? error : { type: "about:blank", title: response.statusText, status: response.status };
}

/**
 * A failed start: a 400 says why (for example the size limit), as the text
 * `applyFieldErrors` leaves when no form field takes it; anything else is a
 * plain failure.
 */
function startFailure(error: unknown, response: Response): UploadError {
  const problem = problemOf(error, response);
  if (problem.status !== 400) return new UploadError();
  const why = problem.errors?.length ? problem.errors.map((e) => e.message).join(" ") : problem.detail;
  return new UploadRefusedError(why || "Upload failed.");
}

/** Creates the file and its first version, and gets a signed upload link. One `Idempotency-Key` per call. */
export async function startUpload(clients: UploadClients, target: UploadTarget, file: File): Promise<StartedUpload> {
  const key = newIdempotencyKey();
  // erp-api needs a type/subtype; browsers leave it empty for types they don't know (meshes, for one).
  const declared = { name: file.name, content_type: file.type || "application/octet-stream", size: file.size };

  if (target.area === "partner") {
    if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type))
      throw new UploadRefusedError("Choose a JPEG, PNG or WebP photo.");
    const { data, error, response } = await clients.partnerApi.POST("/partner-portal/partners/{partnerId}/files", {
      params: { path: { partnerId: target.partnerId }, header: idempotencyHeader(key) },
      body: declared,
    });
    if (!data) throw startFailure(error, response);
    return { fileId: data.file.id, versionId: data.version.id, upload: data.upload };
  }

  const { data, error, response } = await clients.api.POST("/files", {
    body: {
      ...declared,
      kind: target.kind,
      ...(target.declaredUnit && { declared_unit: target.declaredUnit }),
      ...(target.customerId && { customer_id: target.customerId }),
    },
    params: { header: idempotencyHeader(key) },
  });
  if (!data) throw startFailure(error, response);
  return { fileId: data.file.id, versionId: data.version.id, upload: data.upload };
}

/**
 * PUTs the bytes straight to storage through the signed link. `XMLHttpRequest`,
 * because `fetch` can't report upload progress. Sends only `content-type`: the
 * browser sets `content-length`, and the link is the only credential.
 */
export function putToStorage(
  upload: SignedUpload,
  file: Blob,
  options: { onProgress(fraction: number): void; signal: AbortSignal },
): Promise<void> {
  const { onProgress, signal } = options;
  if (Date.parse(upload.expires_at) <= Date.now()) return Promise.reject(new UploadExpiredError());
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("PUT", upload.url);
    const contentType = upload.headers["content-type"];
    if (contentType) xhr.setRequestHeader("content-type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else if (xhr.status === 403) {
        // Storage refuses a link that has run out with a 403.
        reject(new UploadExpiredError());
      } else {
        reject(new UploadNetworkError());
      }
    };
    xhr.onerror = () => reject(new UploadNetworkError());
    xhr.onabort = () => reject(signal.reason);
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}

/** Tells erp-api the bytes are in, so it measures them. 409: nothing, or something else, arrived. */
export async function completeUpload(
  clients: UploadClients,
  target: UploadTarget,
  fileId: string,
  versionId: string,
): Promise<void> {
  const { data, response } =
    target.area === "partner"
      ? await clients.partnerApi.POST("/partner-portal/partners/{partnerId}/files/{id}/versions/{versionId}/complete", {
          params: { path: { partnerId: target.partnerId, id: fileId, versionId } },
        })
      : await clients.api.POST("/files/{id}/versions/{versionId}/complete", {
          params: { path: { id: fileId, versionId } },
        });
  if (data) return;
  if (response.status === 409) throw new UploadMismatchError();
  throw new UploadError();
}

/** The file with its versions, newest first, for following the measuring. */
export async function readFile(clients: UploadClients, target: UploadTarget, fileId: string): Promise<FileResponse> {
  const { data, response } =
    target.area === "partner"
      ? await clients.partnerApi.GET("/partner-portal/partners/{partnerId}/files/{id}", {
          params: { path: { partnerId: target.partnerId, id: fileId } },
        })
      : await clients.api.GET("/files/{id}", { params: { path: { id: fileId } } });
  if (!data) throw new Error(`Reading the file failed: ${response.status}`);
  return data;
}
