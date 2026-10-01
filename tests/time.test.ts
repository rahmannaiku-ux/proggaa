import { describe, expect, it } from "vitest";
import {
  bstDateKey,
  bstDayDiff,
  formatBstDate,
  formatBstDateTime,
  formatBstTime,
  relativeTime,
  startOfBstDay,
} from "../src/utils/time";

/**
 * Bangladesh time is UTC+6 with no daylight saving. These results must be the
 * same whatever timezone the server happens to run in (run the suite with
 * TZ=UTC and TZ=America/New_York; both must pass).
 */
describe("Bangladesh Standard Time", () => {
  it("shows an instant as UTC+6 wall-clock time", () => {
    // 2026-10-02 15:30 UTC is 21:30 in Bangladesh.
    expect(formatBstDateTime("2026-10-02T15:30:00.000Z")).toMatch(/2 Oct.*9:30 pm BST$/);
    expect(formatBstTime("2026-10-02T15:30:00.000Z")).toBe("9:30 pm");
  });

  it("rolls the date forward when UTC is still the previous day", () => {
    // 20:00 UTC on the 1st is 02:00 on the 2nd in Bangladesh.
    expect(formatBstDate("2026-10-01T20:00:00.000Z")).toBe("2 Oct 2026");
    expect(bstDateKey("2026-10-01T20:00:00.000Z")).toBe("2026-10-02");
  });

  it("finds the start of the Bangladesh day, not the UTC day", () => {
    // Bangladesh midnight is 18:00 UTC the previous evening.
    expect(startOfBstDay("2026-10-02T03:00:00.000Z").toISOString()).toBe("2026-10-01T18:00:00.000Z");
    expect(startOfBstDay("2026-10-02T17:59:00.000Z").toISOString()).toBe("2026-10-01T18:00:00.000Z");
    expect(startOfBstDay("2026-10-02T18:00:00.000Z").toISOString()).toBe("2026-10-02T18:00:00.000Z");
  });

  it("counts calendar days in Bangladesh", () => {
    expect(bstDayDiff("2026-10-02T17:00:00.000Z", "2026-10-02T19:00:00.000Z")).toBe(1); // straddles BST midnight
    expect(bstDayDiff("2026-10-02T01:00:00.000Z", "2026-10-02T10:00:00.000Z")).toBe(0);
  });

  it("describes how far away an instant is", () => {
    const now = new Date("2026-10-02T10:00:00.000Z");
    expect(relativeTime("2026-10-02T10:05:00.000Z", now)).toBe("in 5 min");
    expect(relativeTime("2026-10-02T08:00:00.000Z", now)).toBe("2h ago");
    expect(relativeTime("2026-10-05T10:00:00.000Z", now)).toBe("in 3d");
    expect(relativeTime("2026-10-02T10:00:10.000Z", now)).toBe("now");
  });

  it("does not throw on a bad date", () => {
    expect(formatBstDateTime("not a date")).toBe("unknown time");
    expect(formatBstDate("not a date")).toBe("unknown date");
  });
});
