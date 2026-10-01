import { Markup } from "telegraf";
import type { Course, ExamResult, ExamSummary, LiveClass, LiveExamStatus, Payment } from "../../types/domain";
import type { DeepLinkService } from "../../services/deep-links/DeepLinkService";
import { ICON } from "../messages/brand";

/** Buttons that open the matching page on the Proggaa website. */

export function missionCardKeyboard(course: Course, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${ICON.mission} Open here`, `m:${course.id}`), Markup.button.url("🌐 On Proggaa", deepLinks.mission(course.id))],
  ]);
}

export function mentorMissionKeyboard(course: Course, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([[Markup.button.url(`${ICON.mission} Open builder`, deepLinks.mentorMission(course.id))]]);
}

export function encounterCardKeyboard(exam: ExamSummary, deepLinks: DeepLinkService) {
  const label = exam.status === "COMPLETED" ? `${ICON.result} View` : `${ICON.encounter} Open Encounter`;
  return Markup.inlineKeyboard([[Markup.button.url(label, deepLinks.encounter(exam.id))]]);
}

export function resultCardKeyboard(result: ExamResult, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([[Markup.button.url(`${ICON.result} View result`, deepLinks.result(result.id))]]);
}

export function liveClassKeyboard(liveClass: LiveClass, deepLinks: DeepLinkService) {
  const url = deepLinks.fromPath(liveClass.path) ?? deepLinks.liveClasses();
  return Markup.inlineKeyboard([[Markup.button.url(liveClass.status === "LIVE" ? `${ICON.live} Join now` : "Open Patrol", url)]]);
}

export function liveExamKeyboard(status: LiveExamStatus, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([[Markup.button.url(`${ICON.live} Open live monitor`, deepLinks.mentorLiveExam(status.examId))]]);
}

export function gradingKeyboard(deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([[Markup.button.url("📝 Open grading queue", deepLinks.mentorGrading())]]);
}

/** Admin review card: confirm-first approve and reject, plus the website's own payment tools. */
export function paymentReviewKeyboard(payment: Payment, deepLinks: DeepLinkService) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Approve", `payment:approve:ask:${payment.id}`),
      Markup.button.callback("❌ Reject", `payment:reject:ask:${payment.id}`),
    ],
    [Markup.button.url("🔎 Open on Proggaa", deepLinks.adminPayments())],
  ]);
}
