import type {
  Achievement,
  AdminStatistics,
  Course,
  ExamResult,
  ExamStatus,
  ExamSummary,
  LiveExamStatus,
  Payment,
} from "../../types/domain";

export function progressBar(percent: number, length = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * length);
  return "▓".repeat(filled) + "░".repeat(length - filled);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTimeFromNow(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const abs = Math.abs(diffMin);

  if (abs < 60) return diffMin >= 0 ? `in ${abs} min` : `${abs} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return diffMin >= 0 ? `in ${Math.abs(diffHr)}h` : `${Math.abs(diffHr)}h ago`;
  const diffDays = Math.round(diffHr / 24);
  return diffMin >= 0 ? `in ${Math.abs(diffDays)}d` : `${Math.abs(diffDays)}d ago`;
}

const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  SCHEDULED: "🗓️ Scheduled",
  STARTING_SOON: "🟡 Starting soon",
  LIVE: "🔴 Live now",
  ENDING_SOON: "🟠 Ending soon",
  COMPLETED: "✅ Completed",
  CANCELLED: "🚫 Cancelled",
};

export function examStatusLabel(status: ExamStatus): string {
  return EXAM_STATUS_LABEL[status];
}

export function formatCourseCard(course: Course): string {
  const lines = [`📚 *${course.name}*`, "", `Progress: ${course.progressPercent}%`, progressBar(course.progressPercent)];
  if (course.nextLessonTitle) lines.push(`Next: ${course.nextLessonTitle}`);
  if (course.upcomingExamTitle) lines.push("", `📝 Exam: ${course.upcomingExamTitle}`);
  return lines.join("\n");
}

export function formatExamCard(exam: ExamSummary): string {
  const lines = [
    `📝 *${exam.title}*`,
    "",
    `Course: ${exam.courseName}`,
    `Status: ${examStatusLabel(exam.status)}`,
  ];
  if (exam.status === "COMPLETED") {
    lines.push(`Was: ${formatDateTime(exam.startsAt)}`);
  } else {
    lines.push(`Starts: ${formatDateTime(exam.startsAt)} (${relativeTimeFromNow(exam.startsAt)})`);
  }
  lines.push(`Duration: ${exam.durationMinutes} minutes`);
  return lines.join("\n");
}

export function formatResultCard(result: ExamResult): string {
  return [
    `📊 *${result.examTitle}*`,
    "",
    `Score: ${result.score}/${result.maxScore}`,
    `Percentage: ${result.percentage}%`,
    `Grade: ${result.grade}`,
    `Published: ${formatDateTime(result.publishedAt)}`,
  ].join("\n");
}

export function formatAchievementCard(achievement: Achievement): string {
  return [
    `🏆 *${achievement.name}*`,
    achievement.description,
    `+${achievement.xpAwarded} XP · unlocked ${formatDateTime(achievement.unlockedAt)}`,
  ].join("\n");
}

export function formatPaymentCard(payment: Payment): string {
  return [
    `💰 *${payment.status === "PENDING" ? "New Payment" : "Payment"}*`,
    "",
    `Student: ${payment.studentName}`,
    `Course: ${payment.courseName}`,
    `Amount: ৳${payment.amount}`,
    `Transaction ID: ${payment.transactionId}`,
    `Status: ${payment.status}`,
  ].join("\n");
}

export function formatLiveExamCard(status: LiveExamStatus): string {
  return [
    "🔴 *LIVE EXAM*",
    "",
    status.examTitle,
    "",
    `👥 Students: ${status.totalStudents}`,
    `🟢 Active: ${status.activeStudents}`,
    `✅ Submitted: ${status.submittedStudents}`,
    `⚠️ Suspicious events: ${status.suspiciousEvents}`,
  ].join("\n");
}

export function formatAdminStats(stats: AdminStatistics): string {
  return [
    "📊 *Proggaa Statistics*",
    "",
    `👥 Students: ${stats.studentCount.toLocaleString()}`,
    `👨‍🏫 Teachers: ${stats.teacherCount.toLocaleString()}`,
    `📚 Courses: ${stats.courseCount.toLocaleString()}`,
    `📝 Exams: ${stats.examCount.toLocaleString()}`,
    `🔴 Live Exams: ${stats.liveExamCount}`,
    `💰 Today's Payments: ${stats.currency === "BDT" ? "৳" : stats.currency + " "}${stats.todaysPaymentsTotal.toLocaleString()}`,
  ].join("\n");
}
