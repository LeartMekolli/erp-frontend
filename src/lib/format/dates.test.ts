import { describe, expect, it } from "vitest";

import { dayKey, formatDate, formatDateTime, formatDay, formatDayMonth, formatTime } from "./dates";

describe("dates", () => {
  it("shows an instant in the workspace zone", () => {
    expect(formatDateTime("2026-11-05T23:30:00Z", "Europe/Berlin")).toBe("6 Nov 2026, 00:30");
  });

  it("takes the day from the zone it is given", () => {
    expect(formatDate("2026-11-05T23:30:00Z", "UTC")).toBe("5 Nov 2026");
    expect(formatDate("2026-11-05T23:30:00Z", "Asia/Tokyo")).toBe("6 Nov 2026");
  });

  it("shows the time on a 24-hour clock", () => {
    expect(formatTime("2026-11-05T14:05:00Z", "UTC")).toBe("14:05");
  });

  it("keys an instant by its day in the zone", () => {
    expect(dayKey("2026-11-12T10:30:00Z", "Pacific/Auckland")).toBe("2026-11-12");
    expect(dayKey("2026-11-12T11:30:00Z", "Pacific/Auckland")).toBe("2026-11-13");
  });

  it("shows a day and month without the year", () => {
    expect(formatDayMonth("2026-11-11T09:00:00Z", "UTC")).toBe("11 Nov");
  });

  it("never shifts a calendar day", () => {
    expect(formatDay("2026-11-05")).toBe("5 Nov 2026");
    expect(formatDay("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDay("2026-12-31")).toBe("31 Dec 2026");
  });

  it.each(["2026-11-05T00:00:00Z", "5 Nov 2026", "2026-13-01"])("refuses %j as a day", (day) => {
    expect(() => formatDay(day)).toThrow("Not a calendar day");
  });
});
