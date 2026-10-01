import type {
  Achievement,
  Course,
  ExamResult,
  ExamStatus,
  ExamSummary,
  NotificationCategory,
  NotificationEvent,
  NotificationEventType,
  Payment,
  PaymentStatus,
  ProggaaRole,
  ProggaaUser,
} from "../../../types/domain";

/**
 * Pure translation from the website's /api/bot/* JSON to the bot's own domain
 * types. Kept free of I/O so it can be unit tested with plain objects.
 * The website speaks in its own words (Mission, poisha, SUPER_ADMIN); the bot
 * speaks in Course, taka and three roles.
 */

export function mapRole(role: string): ProggaaRole {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "ADMIN";
  if (role === "TEACHER") return "TEACHER";
  return "STUDENT";
}

export interface WebUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  role: string;
  avatarUrl?: string | null;
  xp?: number;
  streakDays?: number;
}

export function mapUser(u: WebUser): ProggaaUser {
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email ?? undefined,
    role: mapRole(u.role),
    xp: u.xp ?? 0,
    streakDays: u.streakDays ?? 0,
    avatarUrl: u.avatarUrl ?? undefined,
  };
}

export interface WebCourse {
  id: string;
  title: string;
  progressPct?: number;
}

export function mapCourse(c: WebCourse): Course {
  return {
    id: c.id,
    name: c.title,
    progressPercent: Math.round(c.progressPct ?? 0),
  };
}

export interface WebExam {
  id: string;
  title: string;
  isLiveExam?: boolean;
  liveStatus?: string | null;
  timeLimitSeconds?: number | null;
  publishedAt?: string | null;
  monitoringStartsAt?: string | null;
  monitoringEndsAt?: string | null;
  accessOpensAt?: string | null;
  accessClosesAt?: string | null;
  archivedAt?: string | null;
  courseId?: string | null;
  course?: { id: string; title: string } | null;
  courseTitle?: string | null;
}

const MINUTE = 60_000;

export function mapExamStatus(e: WebExam, now: Date = new Date()): ExamStatus {
  const t = now.getTime();
  const at = (v?: string | null) => (v ? new Date(v).getTime() : null);
  const start = at(e.monitoringStartsAt) ?? at(e.accessOpensAt);
  const end = at(e.monitoringEndsAt);
  const closes = at(e.accessClosesAt);

  if (e.archivedAt || e.liveStatus === "ARCHIVED" || e.liveStatus === "CLOSED") return "COMPLETED";
  if (e.liveStatus === "LIVE") {
    return end !== null && end - t <= 10 * MINUTE ? "ENDING_SOON" : "LIVE";
  }
  if (e.liveStatus === "ACCESS_OPEN") return "LIVE";
  if (e.liveStatus === "SCHEDULED") {
    return start !== null && start - t <= 60 * MINUTE && start > t ? "STARTING_SOON" : "SCHEDULED";
  }

  // Not a live exam (a quiz, or an exam without a monitoring window): it is
  // available between its access times, whenever those are set.
  if (closes !== null && t > closes) return "COMPLETED";
  if (start !== null && t < start) return start - t <= 60 * MINUTE ? "STARTING_SOON" : "SCHEDULED";
  return "LIVE";
}

export function mapExam(e: WebExam, now: Date = new Date()): ExamSummary {
  const startsAt = e.monitoringStartsAt ?? e.accessOpensAt ?? e.publishedAt ?? now.toISOString();
  return {
    id: e.id,
    courseId: e.courseId ?? e.course?.id ?? "",
    courseName: e.course?.title ?? e.courseTitle ?? "",
    title: e.title,
    status: mapExamStatus(e, now),
    startsAt: new Date(startsAt).toISOString(),
    durationMinutes: Math.round((e.timeLimitSeconds ?? 0) / 60),
  };
}

/** Letter grade from a percentage, since the website stores only the score. */
export function gradeFor(percentage: number): string {
  if (percentage >= 80) return "A+";
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "A-";
  if (percentage >= 50) return "B";
  if (percentage >= 40) return "C";
  if (percentage >= 33) return "D";
  return "F";
}

export interface WebResult {
  id: string;
  submittedAt?: string | null;
  rawScore?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  assessment: { id: string; title: string };
}

export function mapResult(r: WebResult, userId: string): ExamResult {
  const percentage = Math.round((r.percentage ?? 0) * 10) / 10;
  return {
    id: r.id,
    examId: r.assessment.id,
    examTitle: r.assessment.title,
    userId,
    score: r.rawScore ?? 0,
    maxScore: r.maxScore ?? 0,
    percentage,
    grade: gradeFor(percentage),
    publishedAt: new Date(r.submittedAt ?? Date.now()).toISOString(),
  };
}

export interface WebPayment {
  id: string;
  userId?: string;
  status: string;
  amountCents: number;
  currency: string;
  transactionId?: string | null;
  createdAt: string;
  course?: { id: string; title: string } | null;
  user?: { id: string; firstName: string; lastName: string } | null;
}

export function mapPaymentStatus(status: string): PaymentStatus {
  if (status === "PAID") return "APPROVED";
  if (status === "REJECTED" || status === "EXPIRED" || status === "CANCELLED") return "REJECTED";
  return "PENDING"; // PENDING and AWAITING_VERIFICATION
}

export function mapPayment(p: WebPayment, studentName?: string): Payment {
  return {
    id: p.id,
    studentId: p.userId ?? p.user?.id ?? "",
    studentName: studentName ?? (p.user ? `${p.user.firstName} ${p.user.lastName}`.trim() : ""),
    courseId: p.course?.id ?? "",
    courseName: p.course?.title ?? "",
    amount: p.amountCents / 100, // the website stores poisha, the bot shows taka
    currency: p.currency,
    transactionId: p.transactionId ?? "",
    status: mapPaymentStatus(p.status),
    createdAt: new Date(p.createdAt).toISOString(),
  };
}

export interface WebAchievement {
  key: string;
  name: string;
  description: string;
  xpBonus?: number | null;
  unlockedAt: string;
}

export function mapAchievement(a: WebAchievement, userId: string): Achievement {
  return {
    id: a.key,
    userId,
    name: a.name,
    description: a.description,
    xpAwarded: a.xpBonus ?? 0,
    unlockedAt: new Date(a.unlockedAt).toISOString(),
  };
}

export interface WebNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

const NOTIFICATION_KINDS: Record<string, { type: NotificationEventType; category: NotificationCategory }> = {
  GRADE_POSTED: { type: "RESULTS_PUBLISHED", category: "RESULTS" },
  ENROLLMENT: { type: "ENROLLMENT_COMPLETED", category: "COURSE_UPDATES" },
  CERTIFICATE_ISSUED: { type: "ACHIEVEMENT_UNLOCKED", category: "ACHIEVEMENTS" },
  EXAM_REMINDER: { type: "EXAM_REMINDER_1_DAY", category: "EXAM_REMINDERS" },
  ASSIGNMENT_DUE: { type: "SYSTEM_NOTICE", category: "ASSIGNMENTS" },
  ACHIEVEMENT_UNLOCKED: { type: "ACHIEVEMENT_UNLOCKED", category: "ACHIEVEMENTS" },
  PAYMENT_AWAITING_VERIFICATION: { type: "PAYMENT_NEW", category: "PAYMENTS" },
  PAYMENT_VERIFIED: { type: "PAYMENT_APPROVED", category: "PAYMENTS" },
  PAYMENT_REJECTED: { type: "PAYMENT_REJECTED", category: "PAYMENTS" },
  LIVE_CLASS_REMINDER: { type: "EXAM_REMINDER_1_HOUR", category: "COURSE_UPDATES" },
  ANNOUNCEMENT: { type: "NEW_ANNOUNCEMENT", category: "COURSE_UPDATES" },
};

export function mapNotification(n: WebNotification, userId: string): NotificationEvent {
  const kind = NOTIFICATION_KINDS[n.type] ?? { type: "SYSTEM_NOTICE" as const, category: "SYSTEM_ALERTS" as const };
  return {
    type: kind.type,
    userId,
    category: kind.category,
    title: n.title,
    body: n.body,
    data: { notificationId: n.id, createdAt: n.createdAt },
  };
}
