import { Markup } from "telegraf";
import type { Course, ExamSummary, ExamResult, LiveExamStatus, Payment } from "../../types/domain";
import type { DeepLinkService } from "../../services/deep-links/DeepLinkService";

export function courseCardKeyboard(course: Course, deepLinks: DeepLinkService) {
  const rows = [[Markup.button.url("📖 Open Course", deepLinks.getCourseLink(course.id))]];
  if (course.upcomingExamId) {
    rows.push([Markup.button.url("📝 View Exam", deepLinks.getExamLink(course.upcomingExamId))]);
  }
  return Markup.inlineKeyboard(rows);
}

export function examCardKeyboard(exam: ExamSummary, deepLinks: DeepLinkService) {
  if (exam.status === "COMPLETED") {
    return Markup.inlineKeyboard([[Markup.button.url("📊 View Result", deepLinks.getExamLink(exam.id))]]);
  }
  return Markup.inlineKeyboard([[Markup.button.url("📝 Open Exam", deepLinks.getExamLink(exam.id))]]);
}

export function resultCardKeyboard(result: ExamResult, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([[Markup.button.url("📊 View Result", deepLinks.getResultLink(result.id))]]);
}

export function liveExamCardKeyboard(status: LiveExamStatus, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([
    [Markup.button.url("🔴 Open Live Monitor", deepLinks.getLiveMonitorLink(status.examId))],
  ]);
}

export function gradingQueueKeyboard(examId: string, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([[Markup.button.url("📝 Open Grading Queue", deepLinks.getGradingLink(examId))]]);
}

export function paymentReviewKeyboard(payment: Payment, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Approve", `payment:approve:ask:${payment.id}`),
      Markup.button.callback("❌ Reject", `payment:reject:ask:${payment.id}`),
    ],
    [Markup.button.url("🔎 View on website", deepLinks.getPaymentLink(payment.id))],
  ]);
}
