import type {
  Achievement,
  Course,
  ExamResult,
  ExamStatus,
  ExamSummary,
  FeedNotification,
  LiveClass,
  NotificationCategory,
  Payment,
  PaymentStatus,
  ProggaaNotification,
  ProggaaRole,
  ProggaaUser,
} from "../../../types/domain";

/**
 * Pure translation from the website's /api/bot/* JSON to the bot's own domain
 * types. No I/O, so it can be unit tested with plain objects. The website
 * speaks in its own words (poisha, SUPER_ADMIN, createdAt); the bot speaks in
 * taka and three roles.
 */

export function mapRole(role: string): ProggaaRole {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "ADMIN";
  if (role === "TEACHER") return "TEACHER";
  return "STUDENT";
}

// --- people ------------------------------------------------------------------

export interface WebUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  role: string;
  avatarUrl?: string | null;
  xp?: number;
  level?: number;
  xpIntoLevel?: number;
  xpForNextLevel?: number;
  streakDays?: number;
  coinBalance?: number;
}

export function mapUser(u: WebUser): ProggaaUser {
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email ?? undefined,
    role: mapRole(u.role),
    xp: u.xp ?? 0,
    level: u.level ?? 1,
    xpIntoLevel: u.xpIntoLevel ?? 0,
    xpForNextLevel: u.xpForNextLevel ?? 0,
    streakDays: u.streakDays ?? 0,
    coinBalance: u.coinBalance ?? 0,
    avatarUrl: u.avatarUrl ?? undefined,
  };
}

// --- missions ----------------------------------------------------------------

export interface WebCourse {
  id: string;
  title: string;
  progressPct?: number;
}

export function mapCourse(c: WebCourse): Course {
  return { id: c.id, name: c.title, progressPercent: Math.round(c.progressPct ?? 0) };
}

// --- encounters (exams) -------------------------------------------------------

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
    return start !== null && start > t && start - t <= 60 * MINUTE ? "STARTING_SOON" : "SCHEDULED";
  }

  // Not a live exam (a quiz, or an exam without a monitoring window): it is
  // open between its access times, whenever those are set.
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

// --- payments ----------------------------------------------------------------

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

export function mapPayment(p: WebPayment): Payment {
  return {
    id: p.id,
    studentId: p.userId ?? p.user?.id ?? "",
    studentName: p.user ? `${p.user.firstName} ${p.user.lastName}`.trim() : "",
    courseId: p.course?.id ?? "",
    courseName: p.course?.title ?? "",
    amount: p.amountCents / 100, // the website stores poisha, the bot shows taka
    currency: p.currency,
    transactionId: p.transactionId ?? "",
    status: mapPaymentStatus(p.status),
    createdAt: new Date(p.createdAt).toISOString(),
  };
}

// --- achievements and live classes -------------------------------------------

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

export interface WebLiveClass {
  id: string;
  title: string;
  missionId: string;
  missionTitle: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  path: string;
}

export function mapLiveClass(l: WebLiveClass): LiveClass {
  return {
    id: l.id,
    title: l.title,
    missionId: l.missionId,
    missionTitle: l.missionTitle,
    status: l.status === "LIVE" ? "LIVE" : "UPCOMING",
    startsAt: new Date(l.scheduledStart).toISOString(),
    endsAt: new Date(l.scheduledEnd).toISOString(),
    path: l.path,
  };
}

// --- notifications -----------------------------------------------------------

/** Proggaa's own notification types, each filed under one category a hero can mute. */
const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  ANNOUNCEMENT: "ANNOUNCEMENTS",
  GRADE_POSTED: "RESULTS",
  ENROLLMENT: "MISSIONS",
  CERTIFICATE_ISSUED: "ACHIEVEMENTS",
  EXAM_REMINDER: "EXAM_REMINDERS",
  ASSIGNMENT_DUE: "CHALLENGES",
  STREAK_RISK: "STREAK",
  ACHIEVEMENT_UNLOCKED: "ACHIEVEMENTS",
  SYSTEM: "SYSTEM",
  PAYMENT_AWAITING_VERIFICATION: "PAYMENTS",
  PAYMENT_VERIFIED: "PAYMENTS",
  PAYMENT_REJECTED: "PAYMENTS",
  LIVE_CLASS_REMINDER: "LIVE_CLASSES",
};

export function categoryForProggaaType(type: string): NotificationCategory {
  return CATEGORY_BY_TYPE[type] ?? "SYSTEM";
}

/** Only a path on the Proggaa website is accepted as a link target. */
export function safeLinkPath(linkUrl: string | null | undefined): string | undefined {
  if (!linkUrl) return undefined;
  if (!linkUrl.startsWith("/") || linkUrl.startsWith("//") || linkUrl.includes("\\")) return undefined;
  return linkUrl;
}

export interface WebNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string | null;
  createdAt: string;
}

export function mapNotification(n: WebNotification): ProggaaNotification {
  return {
    id: n.id,
    category: categoryForProggaaType(n.type),
    title: n.title,
    body: n.body,
    linkPath: safeLinkPath(n.linkUrl),
    createdAt: new Date(n.createdAt).toISOString(),
  };
}

export interface WebFeedItem extends WebNotification {
  userId: string;
  telegramId: string;
}

export function mapFeedItem(n: WebFeedItem): FeedNotification {
  return { ...mapNotification(n), proggaaUserId: n.userId, telegramId: n.telegramId };
}
