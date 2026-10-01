import { describe, expect, it } from "vitest";
import { DeepLinkService } from "../src/services/deep-links/DeepLinkService";

const links = new DeepLinkService("https://proggaa.example/");

/** Every path must be a route that really exists in the Proggaa website (src/app). */
describe("DeepLinkService", () => {
  it("builds hero links without a prefix", () => {
    expect(links.dashboard()).toBe("https://proggaa.example/dashboard");
    expect(links.mission("m1")).toBe("https://proggaa.example/missions/m1");
    expect(links.encounter("e1")).toBe("https://proggaa.example/exams/e1");
    expect(links.result("r1")).toBe("https://proggaa.example/results/r1");
    expect(links.wallet()).toBe("https://proggaa.example/wallet");
    expect(links.liveClasses()).toBe("https://proggaa.example/live-classes");
    expect(links.payment("p1")).toBe("https://proggaa.example/payments/p1");
    expect(links.support()).toBe("https://proggaa.example/support");
    expect(links.telegramSettings()).toBe("https://proggaa.example/settings/telegram");
  });

  it("builds mentor and admin links under their own prefixes", () => {
    expect(links.mentorLiveExam("e1")).toBe("https://proggaa.example/mentor/live-exams/e1");
    expect(links.mentorGrading()).toBe("https://proggaa.example/mentor/grading/exams");
    expect(links.mentorMission("m1")).toBe("https://proggaa.example/mentor/missions/m1/builder");
    expect(links.adminPayments()).toBe("https://proggaa.example/admin/payments");
    expect(links.adminBugReports()).toBe("https://proggaa.example/admin/bug-reports");
  });

  it("encodes ids so they cannot change the path", () => {
    expect(links.mission("a/../b?x=1")).toBe("https://proggaa.example/missions/a%2F..%2Fb%3Fx%3D1");
  });

  it("only accepts plain website paths from the website", () => {
    expect(links.fromPath("/missions/m1/operations/o1")).toBe("https://proggaa.example/missions/m1/operations/o1");
    expect(links.fromPath("https://evil.example/")).toBeNull();
    expect(links.fromPath("//evil.example/")).toBeNull();
    expect(links.fromPath("/\\evil.example")).toBeNull();
    expect(links.fromPath("javascript:alert(1)")).toBeNull();
  });
});
