import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createQueryClient } from "@/lib/query/query-client";

import { signedInClients } from "../../../test/api-clients";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import type { UploadTarget } from "./upload";
import { useUpload } from "./use-upload";

const DESIGN: UploadTarget = { area: "staff", kind: "design", declaredUnit: "mm" };
const stl = () => new File(["solid part"], "part.stl", { type: "model/stl" });

let requests: Request[] = [];
beforeEach(() => {
  requests = [];
  server.events.on("request:start", ({ request }) => requests.push(request.clone()));
});
afterEach(() => server.events.removeAllListeners());

function renderUpload(target: UploadTarget, user: FakeUser) {
  const clients = signedInClients(user);
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const phases: string[] = [];
  const rendered = renderHook(
    () => {
      const upload = useUpload(target, { clients });
      if (phases.at(-1) !== upload.phase) phases.push(upload.phase);
      return upload;
    },
    { wrapper },
  );
  return { ...rendered, phases };
}

const done = { timeout: 4_000 };

describe("useUpload", () => {
  it("goes uploading → completing → measuring → done", async () => {
    // The fake completes at once, so React would batch "completing" away; a short wait, then the fake answers.
    server.use(http.post(`${FAKE_API_URL}/files/:id/versions/:versionId/complete`, () => delay(50)));
    const { result, phases } = renderUpload(DESIGN, STAFF);
    act(() => result.current.upload(stl()));
    await waitFor(() => expect(result.current.phase).toBe("done"), done);
    expect(phases).toEqual(["idle", "uploading", "completing", "measuring", "done"]);
    expect(result.current.progress).toBe(1);
    expect(result.current.fileId).toBeTruthy();
  });

  it("exposes the file and its measures once ready", async () => {
    const { result } = renderUpload(DESIGN, STAFF);
    expect(result.current.file).toBeNull();
    expect(result.current.measures).toEqual([]);
    act(() => result.current.upload(stl()));
    expect(result.current.file).toEqual({ name: "part.stl", size: "solid part".length });
    expect(result.current.measures).toEqual([]);
    await waitFor(() => expect(result.current.phase).toBe("done"), done);
    expect(result.current.measures).toContainEqual({ type: "volume", value: "1240", unit: "mm3" });
    expect(result.current.measures).toContainEqual({ type: "bounding_box_z", value: "4", unit: "mm" });
  });

  it("shows the mismatch message when complete answers 409", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/files/:id/versions/:versionId/complete`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "Upload does not match" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    const { result } = renderUpload(DESIGN, STAFF);
    act(() => result.current.upload(stl()));
    await waitFor(() => expect(result.current.phase).toBe("failed"), done);
    expect(result.current.message).toBe("The file changed while uploading.");
  });

  it("offers Try again after a failure and starts a new file", async () => {
    server.use(http.put(`${FAKE_API_URL}/__storage/*`, () => HttpResponse.error(), { once: true }));
    const { result } = renderUpload(DESIGN, STAFF);
    act(() => result.current.upload(stl()));
    await waitFor(() => expect(result.current.phase).toBe("failed"), done);
    expect(result.current.message).toBe("The upload stopped. Check your connection.");
    const firstFile = result.current.fileId;

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase).toBe("done"), done);
    expect(result.current.fileId).not.toBe(firstFile);
    const starts = requests.filter((r) => r.method === "POST" && new URL(r.url).pathname === "/files");
    expect(starts).toHaveLength(2);
    expect(starts[1]!.headers.get("idempotency-key")).not.toBe(starts[0]!.headers.get("idempotency-key"));
  });

  it("uploads a partner photo through the partner routes", async () => {
    const photo = new File(["png"], "qc.png", { type: "image/png" });
    const { result } = renderUpload({ area: "partner", partnerId: NORTHCAST_ID }, PARTNER);
    act(() => result.current.upload(photo));
    await waitFor(() => expect(result.current.phase).toBe("done"), done);
    const apiPaths = requests
      .map((r) => new URL(r.url).pathname)
      .filter((path) => !path.startsWith("/__storage/"));
    expect(apiPaths.length).toBeGreaterThan(0);
    for (const path of apiPaths) expect(path.startsWith(`/partner-portal/partners/${NORTHCAST_ID}/files`)).toBe(true);
  });
});
