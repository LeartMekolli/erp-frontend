import { describe, expect, it } from "vitest";

import type { PartnerJobDetail } from "@/lib/api/schema-types";

import { createPartnerJobsStore, RING_BAND_JOB_ID } from "../../../test/fake-erp-api/partner-jobs";
import { createProductionStore } from "../../../test/fake-erp-api/production";
import { NORTHCAST_ID } from "../../../test/fake-erp-api/seed";

import { partnerEntry, partnerPiece, partnerRules } from "./shape";

const NOW = Date.parse("2026-11-12T10:00:00Z");

/** The fake's Ring band as Northcast reads it, with the jobs store that holds it. */
function ringBand() {
  const jobs = createPartnerJobsStore(() => NOW, createProductionStore(() => NOW));
  const read = (): PartnerJobDetail => {
    const answer = jobs.detail(NORTHCAST_ID, RING_BAND_JOB_ID);
    if (!answer.ok) throw new Error("expected Ring band");
    return answer.body;
  };
  return { jobs, read };
}

describe("partner job shape", () => {
  it("lets only the partner's pieces be picked", () => {
    const pieces = ringBand().read().work_orders;
    for (const item of pieces) expect(partnerPiece(item).mayWork).toBe(item.stage === "yours");
    expect(pieces.filter((item) => partnerPiece(item).mayWork)).toHaveLength(4);
  });

  it("holds none of a partner's pieces: erp-api never shows partners a job that waits", () => {
    expect(ringBand().read().work_orders.every((item) => partnerPiece(item).held === null)).toBe(true);
  });

  it("reads the partner's steps as its own, with named rework targets", () => {
    const [finish] = partnerRules(ringBand().read());
    expect(finish).toMatchObject({ key: "finish", partnerStep: true, reworkTargets: [{ key: "finish", name: "Finish" }], pass: { minPhotos: 1, commentRequired: false } });
    expect(finish!.defects[0]).toMatchObject({ key: "scratch", reworkTo: "finish" });
  });

  it("opens each photo through its move", () => {
    const { jobs } = ringBand();
    const { data } = (() => {
      const answer = jobs.moves(NORTHCAST_ID, RING_BAND_JOB_ID, new URLSearchParams());
      if (!answer.ok) throw new Error("expected moves");
      return answer.body;
    })();
    const withPhoto = data.find((action) => action.photos.length > 0)!;
    const entry = partnerEntry(withPhoto);
    expect(entry.photos[0]).toEqual({ fileId: withPhoto.photos[0]!.file_id, fileVersionId: withPhoto.photos[0]!.file_version_id, moveId: withPhoto.id });
    expect(entry.actor).toEqual({ kind: "workspace", name: null, forPartner: null });
  });
});
