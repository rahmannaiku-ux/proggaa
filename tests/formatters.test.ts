import { describe, expect, it } from "vitest";
import { progressBar, examStatusLabel, formatAdminStats } from "../src/bot/messages/formatters";

describe("progressBar", () => {
  it("renders a fully-filled bar at 100%", () => {
    expect(progressBar(100, 10)).toBe("▓".repeat(10));
  });

  it("renders a fully-empty bar at 0%", () => {
    expect(progressBar(0, 10)).toBe("░".repeat(10));
  });

  it("renders a half-filled bar at 50%", () => {
    expect(progressBar(50, 10)).toBe("▓".repeat(5) + "░".repeat(5));
  });

  it("clamps values above 100", () => {
    expect(progressBar(150, 10)).toBe("▓".repeat(10));
  });

  it("clamps negative values", () => {
    expect(progressBar(-20, 10)).toBe("░".repeat(10));
  });
});

describe("examStatusLabel", () => {
  it("returns a human label for each status", () => {
    expect(examStatusLabel("LIVE")).toContain("Live");
    expect(examStatusLabel("COMPLETED")).toContain("Completed");
    expect(examStatusLabel("CANCELLED")).toContain("Cancelled");
  });
});

describe("formatAdminStats", () => {
  it("includes the currency symbol for BDT", () => {
    const text = formatAdminStats({
      studentCount: 10,
      teacherCount: 2,
      courseCount: 3,
      examCount: 4,
      liveExamCount: 1,
      todaysPaymentsTotal: 500,
      currency: "BDT",
    });
    expect(text).toContain("৳500");
    expect(text).toContain("Students: 10");
  });
});
