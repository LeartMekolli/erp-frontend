import { describe, expect, it } from "vitest";

import type { PartnerJob } from "@/lib/api/schema-types";

import { answerByText, doneText, dueText, jobTitle, lostText, piecesText, stepsText, timeLeft } from "./labels";

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
  });

  it("counts lost pieces, and says nothing when none are", () => {
    expect(lostText(job({ finished: 6, scrapped: 1 }))).toBe("1 lost");
    expect(lostText(job({ finished: 0, scrapped: 3 }))).toBe("3 lost");
    expect(lostText(job({ finished: 6, scrapped: 0 }))).toBeNull();
  });

  it("lists the steps in order", () => {
    expect(stepsText([{ name: "Print pattern" }, { name: "Casting" }, { name: "Polishing" }])).toBe("Print pattern → Casting → Polishing");
    expect(stepsText([])).toBe("");
  });

  it("says when an offer must be answered by, in the workspace's zone", () => {
    expect(answerByText("2026-11-24T13:00:00Z", "Europe/Berlin")).toBe("Answer by 24 Nov 2026, 14:00");
  });

  it("words the due day, and how late a job is", () => {
    expect(dueText(null, "2026-11-21")).toBeNull();
    expect(dueText("2026-12-04", "2026-11-21")).toEqual({ text: "Due 4 Dec 2026", late: false });
    expect(dueText("2026-11-21", "2026-11-21")).toEqual({ text: "Due 21 Nov 2026", late: false });
    expect(dueText("2026-11-20", "2026-11-21")).toEqual({ text: "Late · 1 day", late: true });
    expect(dueText("2026-11-19", "2026-11-21")).toEqual({ text: "Late · 2 days", late: true });
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
