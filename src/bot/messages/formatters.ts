import type {
  Achievement,
  AdminStatistics,
  Course,
  ExamResult,
  ExamStatus,
  ExamSummary,
  LiveClass,
  LiveExamStatus,
  Payment,
  ProggaaNotification,
  ProggaaUser,
} from "../../types/domain";
import { formatBstDateTime, relativeTime } from "../../utils/time";
import { ICON, TERMS, esc, formatNumber, formatTaka, plural, progressBar } from "./brand";

/** Every time shown to a person goes through utils/time.ts, so it always reads in Bangladesh time. */
export { formatBstDateTime as formatDateTime, relativeTime };

const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  SCHEDULED: "🗓️ Scheduled",
  STARTING_SOON: `${ICON.liveSoon} Starting soon`,
  LIVE: `${ICON.live} Live now`,
  ENDING_SOON: "🟠 Ending soon",
  COMPLETED: `${ICON.done} Completed`,
  CANCELLED: "🚫 Cancelled",
};

export function examStatusLabel(status: ExamStatus): string {
  return EXAM_STATUS_LABEL[status];
}

/** The hero's identity block: level, XP bar, Proggy Coins, streak. */
export function formatHeroStats(user: ProggaaUser): string {
  const percent = user.xpForNextLevel > 0 ? (user.xpIntoLevel / user.xpForNextLevel) * 100 : 100;
  return [
    `${ICON.level} Level ${user.level}   ${ICON.xp} ${formatNumber(user.xp)} XP`,
    `${progressBar(percent)} ${formatNumber(user.xpIntoLevel)}/${formatNumber(user.xpForNextLevel)} to next level`,
    `${ICON.coins} ${formatNumber(user.coinBalance)} ${TERMS.coins}   ${ICON.streak} ${plural(user.streakDays, "day")} streak`,
  ].join("\n");
}

export function formatMissionCard(course: Course): string {
  return [`${ICON.mission} *${esc(course.name)}*`, `${progressBar(course.progressPercent)} ${course.progressPercent}%`].join("\n");
}

export function formatEncounterCard(exam: ExamSummary): string {
  const lines = [
    `${ICON.encounter} *${esc(exam.title)}*`,
    `${TERMS.course}: ${esc(exam.courseName)}`,
    `Status: ${examStatusLabel(exam.status)}`,
  ];
  if (exam.status === "COMPLETED") {
    lines.push(`Was: ${formatBstDateTime(exam.startsAt)}`);
  } else {
    lines.push(`Starts: ${formatBstDateTime(exam.startsAt)} (${relativeTime(exam.startsAt)})`);
  }
  if (exam.durationMinutes > 0) lines.push(`Time limit: ${plural(exam.durationMinutes, "minute")}`);
  return lines.join("\n");
}

export function formatResultCard(result: ExamResult): string {
  return [
    `${ICON.result} *${esc(result.examTitle)}*`,
    `Score: ${result.score}/${result.maxScore}  (${result.percentage}%)`,
    `Grade: ${result.grade}`,
    `Submitted: ${formatBstDateTime(result.publishedAt)}`,
  ].join("\n");
}

export function formatAchievementCard(achievement: Achievement): string {
  return [
    `${ICON.achievement} *${esc(achievement.name)}*`,
    esc(achievement.description),
    `+${achievement.xpAwarded} XP · ${formatBstDateTime(achievement.unlockedAt)}`,
  ].join("\n");
}

export function formatLiveClassCard(liveClass: LiveClass): string {
  const live = liveClass.status === "LIVE";
  return [
    `${live ? ICON.live : ICON.liveSoon} *${esc(liveClass.title)}*`,
    `${TERMS.course}: ${esc(liveClass.missionTitle)}`,
    live
      ? `Live now, until ${formatBstDateTime(liveClass.endsAt)}`
      : `Starts ${formatBstDateTime(liveClass.startsAt)} (${relativeTime(liveClass.startsAt)})`,
  ].join("\n");
}

export function formatPaymentCard(payment: Payment, options: { showStudent?: boolean } = {}): string {
  const status = { PENDING: "⏳ Waiting for verification", APPROVED: `${ICON.done} Verified`, REJECTED: `${ICON.danger} Rejected` }[
    payment.status
  ];
  const lines = [`${ICON.payment} *${esc(payment.courseName || "Payment")}*`];
  if (options.showStudent && payment.studentName) lines.push(`${TERMS.student}: ${esc(payment.studentName)}`);
  lines.push(`Amount: ${formatTaka(payment.amount)}`);
  if (payment.transactionId) lines.push(`Transaction ID: \`${payment.transactionId.replace(/`/g, "")}\``);
  lines.push(`Status: ${status}`, `Created: ${formatBstDateTime(payment.createdAt)}`);
  return lines.join("\n");
}

export function formatLiveExamCard(status: LiveExamStatus): string {
  return [
    `${ICON.live} *Live ${TERMS.exam}*`,
    esc(status.examTitle),
    `${TERMS.student}s: ${status.totalStudents}`,
    `🟢 Active: ${status.activeStudents}`,
    `${ICON.done} Submitted: ${status.submittedStudents}`,
    `${ICON.warn} Integrity flags: ${status.suspiciousEvents}`,
  ].join("\n");
}

export function formatAdminStats(stats: AdminStatistics): string {
  return [
    `${ICON.brand} *Proggaa today*`,
    `${TERMS.student}s: ${formatNumber(stats.studentCount)}`,
    `${TERMS.teacher}s: ${formatNumber(stats.teacherCount)}`,
    `${TERMS.courses}: ${formatNumber(stats.courseCount)}`,
    `${TERMS.exams}: ${formatNumber(stats.examCount)}  (${stats.liveExamCount} live now)`,
    `${ICON.payment} Collected today: ${stats.currency === "BDT" ? formatTaka(stats.todaysPaymentsTotal) : `${stats.currency} ${formatNumber(stats.todaysPaymentsTotal)}`}`,
  ].join("\n");
}

export function formatNotificationLine(n: ProggaaNotification): string {
  return `${ICON.bell} *${esc(n.title)}*\n${esc(n.body)}\n_${formatBstDateTime(n.createdAt)}_`;
}
