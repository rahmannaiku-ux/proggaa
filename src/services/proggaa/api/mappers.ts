import type {
  Achievement,
  Announcement,
  CalendarEntry,
  CatalogMission,
  CatalogMissionDetail,
  CatalogPage,
  CheckoutInstructions,
  Course,
  ExamResult,
  ExamStatus,
  ExamSummary,
  FeedNotification,
  LeaderboardEntry,
  LeaderboardView,
  LiveClass,
  Medal,
  MissionOutline,
  NotificationCategory,
  OperationOutline,
  PatrolDetail,
  Payment,
  PaymentStatus,
  ProggaaNotification,
  ProggaaRole,
  ProggaaUser,
  StoreView,
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
  paymentReference?: string | null;
  receivingNumber?: string | null;
  mfsProvider?: string | null;
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
    reference: p.paymentReference ?? undefined,
    receivingNumber: p.receivingNumber ?? undefined,
    provider: p.mfsProvider ?? undefined,
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

// --- learning ----------------------------------------------------------------

export interface WebMission {
  id: string;
  title: string;
  subtitle?: string | null;
  isFree: boolean;
  enrolled: boolean;
  progressPct: number;
  operations: { id: string; title: string; patrolCount: number; completedCount: number }[];
  resume?: { patrolId: string; title: string } | null;
}

export function mapMissionOutline(m: WebMission): MissionOutline {
  return {
    id: m.id,
    title: m.title,
    subtitle: m.subtitle ?? undefined,
    isFree: m.isFree,
    enrolled: m.enrolled,
    progressPercent: Math.round(m.progressPct),
    operations: m.operations,
    resume: m.resume ?? undefined,
  };
}

export type WebOperation = {
  id: string;
  title: string;
  missionId: string;
  missionTitle: string;
  chapters: {
    id: string;
    title: string;
    classTypes: {
      id: string;
      title: string;
      patrols: { id: string; title: string; durationSeconds: number; isPreview: boolean; isLive: boolean; completed: boolean; locked: boolean }[];
    }[];
  }[];
};

export function mapOperationOutline(o: WebOperation): OperationOutline {
  return o;
}

export interface WebPatrol {
  id: string;
  title: string;
  description?: string | null;
  durationSeconds: number;
  isLive: boolean;
  scheduledStart?: string | null;
  missionId: string;
  missionTitle: string;
  operationId: string;
  operationTitle: string;
  completed: boolean;
  watchedSeconds: number;
  resources: { id: string; title: string; type: string; downloadable: boolean }[];
  notes: { id: string; content: string; createdAt: string }[];
  previous?: { id: string; title: string } | null;
  next?: { id: string; title: string } | null;
  path: string;
}

export function mapPatrol(p: WebPatrol): PatrolDetail {
  return {
    ...p,
    description: p.description ?? undefined,
    scheduledStart: p.scheduledStart ? new Date(p.scheduledStart).toISOString() : undefined,
    previous: p.previous ?? undefined,
    next: p.next ?? undefined,
    // Only a plain path on the Proggaa site is ever used for a link.
    path: safeLinkPath(p.path) ?? "/dashboard",
  };
}

// --- catalog, checkout, store ---------------------------------------------------

export interface WebCatalogMission {
  id: string;
  title: string;
  subtitle?: string | null;
  level: string;
  isFree: boolean;
  priceCents: number;
  finalPriceCents: number;
  durationMinutes: number;
  mentorName: string;
  enrolled: boolean;
  description?: string;
  openPayment?: { id: string; status: string } | null;
}

export function mapCatalogMission(c: WebCatalogMission): CatalogMission {
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle ?? undefined,
    level: c.level,
    isFree: c.isFree,
    price: c.priceCents / 100,
    finalPrice: c.finalPriceCents / 100,
    durationMinutes: c.durationMinutes,
    mentorName: c.mentorName,
    enrolled: c.enrolled,
  };
}

export function mapCatalogDetail(c: WebCatalogMission): CatalogMissionDetail {
  return { ...mapCatalogMission(c), description: c.description ?? "", openPayment: c.openPayment ?? undefined };
}

export function mapCatalogPage(r: { page: number; pageSize: number; total: number; missions: WebCatalogMission[] }): CatalogPage {
  return { page: r.page, pageSize: r.pageSize, total: r.total, missions: r.missions.map(mapCatalogMission) };
}

export interface WebCheckout {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  paymentReference: string;
  receivingNumber?: string | null;
  mfsProvider?: string | null;
  couponCode?: string | null;
  courseTitle?: string | null;
}

export function mapCheckout(p: WebCheckout): CheckoutInstructions {
  return {
    paymentId: p.id,
    amount: p.amountCents / 100,
    currency: p.currency,
    reference: p.paymentReference,
    receivingNumber: p.receivingNumber ?? undefined,
    provider: p.mfsProvider ?? undefined,
    couponCode: p.couponCode ?? undefined,
    missionTitle: p.courseTitle ?? "your Mission",
    fullyDiscounted: p.amountCents <= 0,
  };
}

export function mapStore(r: { coinBalance: number; items: { id: string; title: string; description: string; type: string; priceCoins: number; owned: boolean }[] }): StoreView {
  return { coinBalance: r.coinBalance, items: r.items };
}

// --- social ------------------------------------------------------------------

export interface WebCalendarItem {
  id: string;
  kind: "event" | "live_class" | "assignment_due";
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  path?: string | null;
  missionTitle?: string | null;
}

export function mapCalendarItem(i: WebCalendarItem): CalendarEntry {
  return {
    id: i.id,
    kind: i.kind,
    title: i.title,
    description: i.description ?? undefined,
    startsAt: new Date(i.startAt).toISOString(),
    endsAt: i.endAt ? new Date(i.endAt).toISOString() : undefined,
    path: safeLinkPath(i.path),
    missionTitle: i.missionTitle ?? undefined,
  };
}

export function mapLeaderboard(r: { schedule: string; top: LeaderboardEntry[]; me: LeaderboardEntry | null }): LeaderboardView {
  return { schedule: r.schedule, top: r.top, me: r.me ?? undefined };
}

export function mapMedal(m: { id: string; missionTitle: string; issuedAt?: string | null; verifyPath: string }): Medal {
  return {
    id: m.id,
    missionTitle: m.missionTitle,
    issuedAt: m.issuedAt ? new Date(m.issuedAt).toISOString() : undefined,
    verifyPath: safeLinkPath(m.verifyPath) ?? "/",
  };
}

export function mapAnnouncement(a: { id: string; title: string; body: string; missionTitle?: string | null; createdAt: string }): Announcement {
  return { id: a.id, title: a.title, body: a.body, missionTitle: a.missionTitle ?? undefined, createdAt: new Date(a.createdAt).toISOString() };
}
