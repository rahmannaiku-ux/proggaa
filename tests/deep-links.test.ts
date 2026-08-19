import { describe, expect, it } from "vitest";
import { DeepLinkService } from "../src/services/deep-links/DeepLinkService";

describe("DeepLinkService", () => {
  const service = new DeepLinkService("https://proggaa.example.com/");

  it("strips trailing slashes from the base URL", () => {
    expect(service.getDashboardLink()).toBe("https://proggaa.example.com/dashboard");
  });

  it("builds course links", () => {
    expect(service.getCourseLink("course_physics")).toBe(
      "https://proggaa.example.com/courses/course_physics"
    );
  });

  it("builds exam links", () => {
    expect(service.getExamLink("exam_1")).toBe("https://proggaa.example.com/exams/exam_1");
  });

  it("builds grading links nested under an exam", () => {
    expect(service.getGradingLink("exam_1")).toBe(
      "https://proggaa.example.com/exams/exam_1/grading"
    );
  });

  it("builds live monitor links nested under an exam", () => {
    expect(service.getLiveMonitorLink("exam_1")).toBe(
      "https://proggaa.example.com/exams/exam_1/live"
    );
  });

  it("URL-encodes ids that contain special characters", () => {
    expect(service.getCourseLink("course a/b")).toBe(
      "https://proggaa.example.com/courses/course%20a%2Fb"
    );
  });
});
