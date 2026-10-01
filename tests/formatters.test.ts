import { describe, expect, it } from "vitest";
import {
  formatAdminStats,
  formatEncounterCard,
  formatHeroStats,
  formatLiveClassCard,
  formatMissionCard,
  formatPaymentCard,
  formatResultCard,
} from "../src/bot/messages/formatters";
import { esc, formatTaka, plural, progressBar } from "../src/bot/messages/brand";
import { ADMIN, EXAMS, LIVE_CLASSES, RESULTS, STATS, STUDENT, freshPayments } from "./fakes";

describe("Proggaa wording", () => {
  it("uses Mission, Encounter, Proggy Coins and XP, not the database words", () => {
    const text = [
      formatMissionCard({ id: "m", name: "Physics", progressPercent: 50 }),
      formatEncounterCard(EXAMS[0]!),
      formatHeroStats(STUDENT),
      formatLiveClassCard(LIVE_CLASSES[0]!),
    ].join("\n");
    expect(text).toContain("Mission");
    expect(text).toContain("Proggy Coins");
    expect(text).toContain("XP");
    expect(text).not.toMatch(/\bCourse\b|\bLesson\b|\bModule\b/);
  });
});

describe("hero stats", () => {
  it("shows level, XP into the level, coins and streak", () => {
    const text = formatHeroStats(STUDENT);
    expect(text).toContain("Level 4");
    expect(text).toContain("320 XP");
    expect(text).toContain("40/120");
    expect(text).toContain("250 Proggy Coins");
    expect(text).toContain("12 days");
  });

  it("says '1 day' for a one-day streak", () => {
    expect(formatHeroStats({ ...STUDENT, streakDays: 1 })).toContain("1 day streak");
  });
});

describe("Markdown safety", () => {
  it("escapes characters that would break Telegram's Markdown in names", () => {
    expect(esc("Chemistry_Basics *new* [1]")).toBe("Chemistry\\_Basics \\*new\\* \\[1\\]");
    const card = formatMissionCard({ id: "m", name: "Chemistry_Basics", progressPercent: 10 });
    expect(card).toContain("Chemistry\\_Basics");
  });

  it("does not let a payment's TXID break out of its code span", () => {
    const payment = { ...freshPayments()[0]!, transactionId: "AB`C" };
    expect(formatPaymentCard(payment)).toContain("`ABC`");
  });
});

describe("times are Bangladesh time", () => {
  it("labels encounter, result and live class times as BST", () => {
    expect(formatEncounterCard(EXAMS[0]!)).toContain("BST");
    expect(formatResultCard(RESULTS[0]!)).toContain("BST");
    expect(formatLiveClassCard(LIVE_CLASSES[0]!)).toContain("BST");
  });
});

describe("money and progress", () => {
  it("formats taka and progress bars", () => {
    expect(formatTaka(500)).toBe("৳500");
    expect(formatTaka(1234.5)).toBe("৳1,234.5");
    expect(progressBar(50, 10)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(progressBar(-10, 4)).toBe("▱▱▱▱");
    expect(progressBar(500, 4)).toBe("▰▰▰▰");
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(3, "day")).toBe("3 days");
  });

  it("shows the admin numbers with taka", () => {
    const text = formatAdminStats(STATS);
    expect(text).toContain("৳48,500");
    expect(text).toContain("1,248");
    void ADMIN;
  });
});
