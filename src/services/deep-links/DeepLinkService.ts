import { env } from "../../config/env";

/**
 * The one place that knows how to build a link to the Proggaa website.
 * Paths here mirror the website's real routes (src/app in the Proggaa project):
 * hero pages are unprefixed, mentor pages sit under /mentor and admin pages
 * under /admin. No other file should assemble a Proggaa URL by hand.
 *
 * Every id is URL-encoded, and a path that comes from the website itself (a
 * notification's link) is only accepted if it is a plain path on the site.
 */
export class DeepLinkService {
  constructor(private readonly baseUrl: string = env.PROGGAA_WEB_URL) {}

  private build(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, "")}${path}`;
  }

  // --- heroes ---
  dashboard() { return this.build("/dashboard"); }
  missions() { return this.build("/missions"); }
  mission(missionId: string) { return this.build(`/missions/${encodeURIComponent(missionId)}`); }
  encounters() { return this.build("/exams"); }
  encounter(examId: string) { return this.build(`/exams/${encodeURIComponent(examId)}`); }
  results() { return this.build("/results"); }
  result(resultId: string) { return this.build(`/results/${encodeURIComponent(resultId)}`); }
  liveClasses() { return this.build("/live-classes"); }
  wallet() { return this.build("/wallet"); }
  calendar() { return this.build("/calendar"); }
  medals() { return this.build("/medals"); }
  store() { return this.build("/store"); }
  leaderboard() { return this.build("/leaderboard"); }
  notifications() { return this.build("/notifications"); }
  support() { return this.build("/support"); }
  payment(paymentId: string) { return this.build(`/payments/${encodeURIComponent(paymentId)}`); }
  telegramSettings() { return this.build("/settings/telegram"); }
  profile() { return this.build("/profile"); }

  // --- mentors ---
  mentorDashboard() { return this.build("/mentor/dashboard"); }
  mentorMission(missionId: string) { return this.build(`/mentor/missions/${encodeURIComponent(missionId)}/builder`); }
  mentorGrading() { return this.build("/mentor/grading/exams"); }
  mentorLiveExam(examId: string) { return this.build(`/mentor/live-exams/${encodeURIComponent(examId)}`); }
  mentorAnalytics() { return this.build("/mentor/analytics"); }

  // --- admins ---
  adminDashboard() { return this.build("/admin/dashboard"); }
  adminPayments() { return this.build("/admin/payments"); }
  adminUsers() { return this.build("/admin/users"); }
  adminBugReports() { return this.build("/admin/bug-reports"); }

  /** A path the website itself supplied (for example a notification's link). */
  fromPath(path: string): string | null {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
    return this.build(path);
  }
}
