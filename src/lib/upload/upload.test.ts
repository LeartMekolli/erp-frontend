import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { signedInClients } from "../../../test/api-clients";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import {
  UploadExpiredError,
  UploadMismatchError,
  UploadRefusedError,
  completeUpload,
  putToStorage,
  startUpload,
  versionState,
} from "./upload";

const DESIGN = { area: "staff", kind: "design", declaredUnit: "mm" } as const;
const stl = () => new File(["solid part"], "part.stl", { type: "model/stl" });

let requests: Request[] = [];
beforeEach(() => {
  requests = [];
  server.events.on("request:start", ({ request }) => requests.push(request.clone()));
});
afterEach(() => server.events.removeAllListeners());

// jsdom sends a CORS preflight first; only the PUTs carry the upload.
const storageRequests = () =>
  requests.filter((r) => r.method === "PUT" && new URL(r.url).pathname.startsWith("/__storage/"));
const progress = () => {};

describe("startUpload", () => {
  it("sends an Idempotency-Key", async () => {
    await startUpload(signedInClients(STAFF), DESIGN, stl());
    const start = requests.find((r) => r.method === "POST" && new URL(r.url).pathname === "/files");
    expect(start?.headers.get("idempotency-key")).toBeTruthy();
  });

  it("refuses a non-photo for a partner before any request", async () => {
    const pdf = new File(["%PDF"], "report.pdf", { type: "application/pdf" });
    const upload = startUpload(signedInClients(PARTNER), { area: "partner", partnerId: NORTHCAST_ID }, pdf);
    await expect(upload).rejects.toThrow(UploadRefusedError);
    await expect(upload).rejects.toThrow("Choose a JPEG, PNG or WebP photo.");
    expect(requests.filter((r) => new URL(r.url).pathname.includes("/files"))).toEqual([]);
  });
});

describe("putToStorage", () => {
  it("PUTs with only content-type and no bearer token", async () => {
    const file = stl();
    const started = await startUpload(signedInClients(STAFF), DESIGN, file);
    await putToStorage(started.upload, file, { onProgress: progress, signal: new AbortController().signal });
    const [put] = storageRequests();
    expect(put?.method).toBe("PUT");
    expect(put?.headers.get("content-type")).toBe("model/stl");
    expect(put?.headers.get("authorization")).toBeNull();
  });

  it("reports expired when the link ran out, without sending", async () => {
    const upload = {
      url: `${FAKE_API_URL}/__storage/uploads/x/y`,
      headers: { "content-type": "model/stl", "content-length": "10" },
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    };
    await expect(putToStorage(upload, stl(), { onProgress: progress, signal: new AbortController().signal })).rejects.toThrow(
      UploadExpiredError,
    );
    expect(storageRequests()).toEqual([]);
  });

  it("maps a storage 403 to expired", async () => {
    server.use(
      http.put(
        `${FAKE_API_URL}/__storage/*`,
        () => new HttpResponse(null, { status: 403, headers: { "access-control-allow-origin": "*" } }),
      ),
    );
    const file = stl();
    const started = await startUpload(signedInClients(STAFF), DESIGN, file);
    await expect(putToStorage(started.upload, file, { onProgress: progress, signal: new AbortController().signal })).rejects.toThrow(
      UploadExpiredError,
    );
  });
});

describe("completeUpload", () => {
  it("is a mismatch when nothing reached storage", async () => {
    const clients = signedInClients(STAFF);
    const started = await startUpload(clients, DESIGN, stl());
    await expect(completeUpload(clients, DESIGN, started.fileId, started.versionId)).rejects.toThrow(UploadMismatchError);
  });
});

describe("versionState", () => {
  it.each([
    ["pending", "working"],
    ["completing", "working"],
    ["uploaded", "working"],
    ["measuring", "working"],
    ["measured", "done"],
    ["failed", "failed"],
  ])("maps %s to %s", (status, state) => expect(versionState(status)).toBe(state));
});
