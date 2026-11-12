import { describe, expect, it } from "vitest";

import type { PartnerJob } from "@/lib/api/schema-types";

import { doneText, jobTitle, piecesText, scrappedText, timeLeft } from "./labels";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const left = (ms: number) => timeLeft(new Date(NOW + ms).toISOString(), NOW);

function job(pieces: { finished: number; scrapped: number }, quantity = 10): PartnerJob {
  return { quantity, pieces: { active: quantity - pieces.finished - pieces.scrapped, ...pieces } } as PartnerJob;
}

describe("partner job words", () => {
  it("names a job by product and options", () => {
    expect(jobTitle({ product: { name: "Ring" }, options: [{ group: "Material", value: "Silver 925" }] })).toBe("Ring · Silver 925");
    expect(jobTitle({ product: null, options: [] })).toBe("Job");
  });

  it("counts pieces", () => {
    expect(piecesText(1)).toBe("1 piece");
    expect(piecesText(10)).toBe("10 pieces");
    expect(doneText(job({ finished: 6, scrapped: 0 }))).toBe("6 of 10 done");
    expect(scrappedText(job({ finished: 6, scrapped: 1 }))).toBe("1 scrapped");
    expect(scrappedText(job({ finished: 6, scrapped: 0 }))).toBeNull();
  });

  it("words the time left", () => {
    expect(left(2 * DAY + 3 * HOUR)).toEqual({ text: "2 days left to answer", urgent: false, over: false });
    expect(left(DAY).text).toBe("1 day left to answer");
    expect(left(5 * HOUR + 12 * MIN + 30_000)).toEqual({ text: "5 h 12 min left to answer", urgent: false, over: false });
    expect(left(HOUR + 59 * MIN)).toMatchObject({ text: "1 h 59 min left to answer", urgent: true, over: false });
    expect(left(12 * MIN)).toMatchObject({ text: "12 min left to answer", urgent: true });
    expect(left(30_000)).toMatchObject({ text: "Less than a minute left to answer", urgent: true, over: false });
    expect(left(0).over).toBe(true);
    expect(left(-MIN).over).toBe(true);
  });
});
