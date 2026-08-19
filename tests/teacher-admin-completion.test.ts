import { describe, expect, it } from "vitest";
import { MockProggaaCourseService } from "../src/services/proggaa/mock/MockProggaaCourseService";
import { MockProggaaAdminService } from "../src/services/proggaa/mock/MockProggaaAdminService";
import { MockAnnouncementService } from "../src/services/announcements/MockAnnouncementService";
import { NotFoundError } from "../src/services/proggaa/errors";

describe("MockProggaaCourseService.getTeacherAnalytics", () => {
  it("returns plausible aggregate figures", async () => {
    const service = new MockProggaaCourseService();
    const analytics = await service.getTeacherAnalytics("user_teacher_1");

    expect(analytics.totalStudents).toBeGreaterThan(0);
    expect(analytics.avgCourseProgress).toBeGreaterThanOrEqual(0);
    expect(analytics.avgCourseProgress).toBeLessThanOrEqual(100);
    expect(analytics.avgExamScore).toBeGreaterThanOrEqual(0);
    expect(analytics.completionRate).toBeGreaterThanOrEqual(0);
  });
});

describe("MockProggaaAdminService.getAlerts", () => {
  it("always includes at least an operational status entry", async () => {
    const service = new MockProggaaAdminService();
    const alerts = await service.getAlerts();

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((a) => a.message.includes("operational"))).toBe(true);
  });

  it("flags suspicious live-exam activity with warning or critical severity", async () => {
    const service = new MockProggaaAdminService();
    const alerts = await service.getAlerts();

    const suspiciousAlert = alerts.find((a) => a.message.includes("suspicious"));
    expect(suspiciousAlert).toBeDefined();
    expect(["warning", "critical"]).toContain(suspiciousAlert?.severity);
  });
});

describe("MockAnnouncementService", () => {
  it("sends an announcement and returns a recipient count", async () => {
    const service = new MockAnnouncementService();
    const result = await service.sendAnnouncement("course_physics", "user_teacher_1", "Class moved to Room 204.");

    expect(result.recipientCount).toBeGreaterThan(0);
  });

  it("throws NotFoundError for an unknown course", async () => {
    const service = new MockAnnouncementService();
    await expect(
      service.sendAnnouncement("does_not_exist", "user_teacher_1", "Hello")
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
