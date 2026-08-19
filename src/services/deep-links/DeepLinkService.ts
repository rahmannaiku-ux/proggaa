import { env } from "../../config/env";

/**
 * Centralized builder for every link the bot ever sends to the Proggaa
 * website. No other file should construct a Proggaa URL by hand — this
 * keeps the actual routing scheme in exactly one place, so when the real
 * website ships its final routes, only this file changes.
 */
export class DeepLinkService {
  constructor(private readonly baseUrl: string = env.PROGGAA_WEB_URL) {}

  private build(path: string): string {
    const base = this.baseUrl.replace(/\/+$/, "");
    return `${base}${path}`;
  }

  getDashboardLink(): string {
    return this.build("/dashboard");
  }

  getCourseLink(courseId: string): string {
    return this.build(`/courses/${encodeURIComponent(courseId)}`);
  }

  getExamLink(examId: string): string {
    return this.build(`/exams/${encodeURIComponent(examId)}`);
  }

  getResultLink(resultId: string): string {
    return this.build(`/results/${encodeURIComponent(resultId)}`);
  }

  getGradingLink(examId: string): string {
    return this.build(`/exams/${encodeURIComponent(examId)}/grading`);
  }

  getPaymentLink(paymentId: string): string {
    return this.build(`/admin/payments/${encodeURIComponent(paymentId)}`);
  }

  getLiveMonitorLink(examId: string): string {
    return this.build(`/exams/${encodeURIComponent(examId)}/live`);
  }

  getAccountLinkingSettingsLink(): string {
    return this.build("/settings/telegram");
  }
}
