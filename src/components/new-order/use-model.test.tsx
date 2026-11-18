import { act, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMe } from "@/components/session/session-gate";

import { FAKE_API_URL, LUNA_ID, MIRA_ID, ORDER_TAKER, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { readyVersionId } from "./model-field";
import { useModel } from "./use-model";

const stl = () => new File(["solid ring"], "ring.stl", { type: "model/stl" });

/** The bodies of the `POST /files` calls so far, read as JSON as they start. */
let started: Promise<{ customer_id?: string; declared_unit?: string }>[] = [];
beforeEach(() => {
  started = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname === "/files") started.push(request.clone().json());
  });
});
afterEach(() => server.events.removeAllListeners());

type Args = Parameters<typeof useModel>[0];

/** `useModel` for `user`, with the customer and unit changed between renders by `change`. */
async function renderModel(user: FakeUser, initial: Args) {
  const args = { ...initial };
  const view = renderHookAs(user, () => ({ model: useModel(args), me: useMe().data }));
  // The permission comes from /me, so nothing can be uploaded before it has loaded.
  await waitFor(() => expect(view.result.current.me).toBeDefined());
  return {
    result: view.result,
    change(next: Partial<Args>) {
      Object.assign(args, next);
      view.rerender();
    },
  };
}

// Measuring takes a few polls a second apart (the fake's), so a run to "done" is slow by nature.
const done = { timeout: 4_000 };
const SLOW = 15_000;

describe("useModel", () => {
  it(
    "holds the file until a customer is picked",
    async () => {
      const { result, change } = await renderModel(STAFF, { customerId: "", declaredUnit: "mm" });
      act(() => result.current.model.choose(stl()));
      expect(result.current.model.held?.name).toBe("ring.stl");
      expect(result.current.model.waitingForCustomer).toBe(true);
      expect(result.current.model.upload.phase).toBe("idle");

      change({ customerId: LUNA_ID });
      expect(result.current.model.waitingForCustomer).toBe(false);
      expect(result.current.model.upload.phase).toBe("uploading");
      await waitFor(() => expect(started).toHaveLength(1));
      expect(await started[0]).toMatchObject({ customer_id: LUNA_ID, declared_unit: "mm" });
      await waitFor(() => expect(result.current.model.upload.phase).toBe("done"), done);
    },
    SLOW,
  );

  it(
    "uploads again for the new customer",
    async () => {
      const { result, change } = await renderModel(STAFF, { customerId: LUNA_ID, declaredUnit: "mm" });
      act(() => result.current.model.choose(stl()));
      await waitFor(() => expect(result.current.model.upload.phase).toBe("done"), done);
      const lunas = readyVersionId(result.current.model.upload);
      expect(lunas).toBeTruthy();

      change({ customerId: MIRA_ID });
      // Nothing is ready to quote while the new customer's file goes up: the old version is gone at once.
      expect(readyVersionId(result.current.model.upload)).toBeUndefined();
      await waitFor(() => expect(started).toHaveLength(2));
      expect((await Promise.all(started)).map((body) => body.customer_id)).toEqual([LUNA_ID, MIRA_ID]);

      await waitFor(() => expect(result.current.model.upload.phase).toBe("done"), done);
      expect(readyVersionId(result.current.model.upload)).toBeTruthy();
      expect(readyVersionId(result.current.model.upload)).not.toBe(lunas);
    },
    SLOW,
  );

  it(
    "uploads again when the unit changes",
    async () => {
      const { result, change } = await renderModel(STAFF, { customerId: LUNA_ID, declaredUnit: "mm" });
      act(() => result.current.model.choose(stl()));
      await waitFor(() => expect(result.current.model.upload.phase).toBe("done"), done);

      change({ declaredUnit: "cm" });
      expect(readyVersionId(result.current.model.upload)).toBeUndefined();
      await waitFor(() => expect(started).toHaveLength(2));
      expect((await Promise.all(started)).map((body) => body.declared_unit)).toEqual(["mm", "cm"]);
    },
    SLOW,
  );

  it(
    "a unit change mid-upload starts over",
    async () => {
      // The first POST /files waits and then succeeds with its own file; the second answers at once. If the
      // replaced first run still reported, its file and version would land on the second run.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let firstRequestId = "";
      let firstFileId = "";
      let calls = 0;
      server.use(
        http.post(`${FAKE_API_URL}/files`, async ({ request, requestId }) => {
          calls += 1;
          const body = (await request.json()) as Parameters<ReturnType<typeof fakeState>["startFile"]>[0];
          const answer = fakeState().startFile(body, { origin: new URL(request.url).origin });
          if (calls === 1) {
            firstRequestId = requestId;
            firstFileId = answer.file.id;
            await gate;
          }
          return HttpResponse.json(answer, { status: 201 });
        }),
      );
      // Resolves once the gated response has been handed to the client.
      const delivered = new Promise<void>((resolve) => {
        server.events.on("response:mocked", ({ requestId }) => {
          if (requestId === firstRequestId) resolve();
        });
      });

      let args: Args = { customerId: LUNA_ID, declaredUnit: "mm" };
      const view = renderHookAs(STAFF, () => ({ model: useModel(args), me: useMe().data }));
      await waitFor(() => expect(view.result.current.me).toBeDefined());

      act(() => view.result.current.model.choose(stl()));
      await waitFor(() => expect(calls).toBe(1));
      expect(view.result.current.model.upload.phase).toBe("uploading");

      args = { customerId: LUNA_ID, declaredUnit: "cm" };
      view.rerender();
      await waitFor(() => expect(view.result.current.model.upload.phase).toBe("done"), done);
      const { fileId: secondFile, versionId: secondVersion } = view.result.current.model.upload;
      expect(secondFile).toBeTruthy();
      expect(secondFile).not.toBe(firstFileId);

      // Now the first run's success arrives, after it was replaced; it must not land on the second run.
      release();
      await delivered;
      await act(async () => {});
      const { upload } = view.result.current.model;
      expect(upload.fileId).toBe(secondFile);
      expect(upload.versionId).toBe(secondVersion);
      expect(upload.phase).toBe("done");
      expect(upload.progress).toBe(1);
      expect((await Promise.all(started)).map((body) => body.declared_unit)).toEqual(["mm", "cm"]);
    },
    SLOW,
  );

  it(
    "remove drops the file",
    async () => {
      const { result } = await renderModel(STAFF, { customerId: LUNA_ID, declaredUnit: "mm" });
      act(() => result.current.model.choose(stl()));
      await waitFor(() => expect(result.current.model.upload.phase).toBe("done"), done);

      act(() => result.current.model.remove());
      expect(result.current.model.held).toBeNull();
      expect(result.current.model.upload.phase).toBe("idle");
      expect(readyVersionId(result.current.model.upload)).toBeUndefined();
    },
    SLOW,
  );

  it("never uploads without file.write", async () => {
    const { result } = await renderModel(ORDER_TAKER, { customerId: LUNA_ID, declaredUnit: "mm" });
    expect(result.current.model.canUpload).toBe(false);
    act(() => result.current.model.choose(stl()));
    expect(result.current.model.held).not.toBeNull();
    expect(result.current.model.upload.phase).toBe("idle");
    expect(started).toHaveLength(0);
  });
});
