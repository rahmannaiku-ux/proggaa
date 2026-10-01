/**
 * Proggaa domain types, as the Telegram bot sees them.
 *
 * Proggaa owns all of this data. The bot never stores a copy: it reads these
 * shapes from the website's /api/bot/* routes and shows them. Nothing here
 * imports from `telegraf`.
 *
 * Naming: the website and database use plain LMS words (Course, Lesson, Exam)
 * while the product shown to people says Mission, Patrol and Encounter. The
 * types keep the plain names, exactly like Proggaa's own code, and everything
 * a person reads in Telegram uses the Proggaa words (see bot/messages/brand.ts).
 */

export type ProggaaRole = "STUDENT" | "TEACHER" | "ADMIN";

export interface ProggaaUser {
  id: string; // Proggaa user id (NOT the Telegram id)
  name: string;
  email?: string;
  role: ProggaaRole;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streakDays: number;
  /** Proggy Coins balance. */
  coinBalance: number;
  avatarUrl?: string;
}

/** A Mission the hero is enrolled in (or, for a mentor, one they teach). */
export interface Course {
  id: string;
  name: string;
  progressPercent: number; // 0-100, for the requesting student
}

export type ExamStatus =
  | "SCHEDULED"
  | "STARTING_SOON"
  | "LIVE"
  | "ENDING_SOON"
  | "COMPLETED"
  | "CANCELLED";

/** An Encounter (quiz or exam). */
export interface ExamSummary {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  status: ExamStatus;
  startsAt: string; // ISO instant
  durationMinutes: number;
}

export interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  userId: string;
  score: number;
  maxScore: number;
  percentage: number;
  grade: string;
  publishedAt: string; // ISO instant
}

export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  /** Taka (the website stores poisha; the mapper divides by 100). */
  amount: number;
  currency: string; // e.g. "BDT"
  transactionId: string;
  /** The reference to quote when paying (for example PRG-8F42K7). */
  reference?: string;
  /** The number to send the money to, as set up by the admin. */
  receivingNumber?: string;
  provider?: string;
  status: PaymentStatus;
  createdAt: string; // ISO instant
}

export interface Achievement {
  id: string;
  userId: string;
  name: string;
  description: string;
  xpAwarded: number;
  unlockedAt: string; // ISO instant
}

export type LiveClassStatus = "UPCOMING" | "LIVE";

/** A live class (a scheduled Patrol) in one of the hero's Missions. */
export interface LiveClass {
  id: string;
  title: string;
  missionId: string;
  missionTitle: string;
  status: LiveClassStatus;
  startsAt: string; // ISO instant
  endsAt: string; // ISO instant
  /** Website path of the Patrol, for the deep link. */
  path: string;
}

// ---------------------------------------------------------------------------
// Learning: Missions, Operations, Patrols
// ---------------------------------------------------------------------------

export interface MissionOutline {
  id: string;
  title: string;
  subtitle?: string;
  isFree: boolean;
  enrolled: boolean;
  progressPercent: number;
  operations: { id: string; title: string; patrolCount: number; completedCount: number }[];
  /** The Patrol to continue with, when enrolled and not finished. */
  resume?: { patrolId: string; title: string };
}

export interface PatrolListItem {
  id: string;
  title: string;
  durationSeconds: number;
  isPreview: boolean;
  isLive: boolean;
  completed: boolean;
  locked: boolean;
}

export interface OperationOutline {
  id: string;
  title: string;
  missionId: string;
  missionTitle: string;
  chapters: { id: string; title: string; classTypes: { id: string; title: string; patrols: PatrolListItem[] }[] }[];
}

export interface PatrolResource {
  id: string;
  title: string;
  type: string;
  downloadable: boolean;
}

export interface PatrolDetail {
  id: string;
  title: string;
  description?: string;
  durationSeconds: number;
  isLive: boolean;
  scheduledStart?: string;
  missionId: string;
  missionTitle: string;
  operationId: string;
  operationTitle: string;
  completed: boolean;
  watchedSeconds: number;
  resources: PatrolResource[];
  notes: { id: string; content: string; createdAt: string }[];
  previous?: { id: string; title: string };
  next?: { id: string; title: string };
  /** Website path of the Patrol (where the video is watched). */
  path: string;
}

// ---------------------------------------------------------------------------
// Catalog, checkout and the store
// ---------------------------------------------------------------------------

export interface CatalogMission {
  id: string;
  title: string;
  subtitle?: string;
  level: string;
  isFree: boolean;
  /** Taka, before any discount. */
  price: number;
  /** Taka the hero would pay today. */
  finalPrice: number;
  durationMinutes: number;
  mentorName: string;
  enrolled: boolean;
}

export interface CatalogMissionDetail extends CatalogMission {
  description: string;
  openPayment?: { id: string; status: string };
}

export interface CatalogPage {
  page: number;
  pageSize: number;
  total: number;
  missions: CatalogMission[];
}

/** What a hero needs to pay for a Mission. */
export interface CheckoutInstructions {
  paymentId: string;
  /** Taka to send (0 when a coupon covered everything). */
  amount: number;
  currency: string;
  reference: string;
  receivingNumber?: string;
  provider?: string;
  couponCode?: string;
  missionTitle: string;
  /** True when nothing is left to pay and the payment is already awaiting verification. */
  fullyDiscounted: boolean;
}

export interface StoreItem {
  id: string;
  title: string;
  description: string;
  type: string;
  priceCoins: number;
  owned: boolean;
}

export interface StoreView {
  coinBalance: number;
  items: StoreItem[];
}

// ---------------------------------------------------------------------------
// Social: calendar, leaderboard, medals, announcements
// ---------------------------------------------------------------------------

export interface CalendarEntry {
  id: string;
  kind: "event" | "live_class" | "assignment_due";
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  path?: string;
  missionTitle?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  xp: number;
  level: number;
  streakDays: number;
}

export interface LeaderboardView {
  top: LeaderboardEntry[];
  me?: LeaderboardEntry;
  /** "NEVER" for an all-time board, otherwise the reset schedule (this period's XP). */
  schedule: string;
}

export interface Medal {
  id: string;
  missionTitle: string;
  issuedAt?: string;
  verifyPath: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  missionTitle?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The kinds of notification a hero can switch off in Telegram. Each of
 * Proggaa's own notification types belongs to exactly one of these
 * (see categoryForProggaaType in services/proggaa/api/mappers.ts).
 */
export type NotificationCategory =
  | "EXAM_REMINDERS"
  | "RESULTS"
  | "LIVE_CLASSES"
  | "ANNOUNCEMENTS"
  | "MISSIONS"
  | "CHALLENGES"
  | "ACHIEVEMENTS"
  | "STREAK"
  | "PAYMENTS"
  | "SYSTEM";

export interface NotificationPreferences {
  userId: string;
  categories: Record<NotificationCategory, boolean>;
}

/** One of the website's own notifications, as listed in /notifications. */
export interface ProggaaNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Website path the notification points to, if any. */
  linkPath?: string;
  createdAt: string; // ISO instant
}

/** A notification plus who to deliver it to, from the website's feed. */
export interface FeedNotification extends ProggaaNotification {
  proggaaUserId: string;
  telegramId: string;
}

// ---------------------------------------------------------------------------
// Mentor and admin views
// ---------------------------------------------------------------------------

export interface LiveExamStatus {
  examId: string;
  examTitle: string;
  totalStudents: number;
  activeStudents: number;
  submittedStudents: number;
  suspiciousEvents: number;
}

export interface AdminStatistics {
  studentCount: number;
  teacherCount: number;
  courseCount: number;
  examCount: number;
  liveExamCount: number;
  /** Taka collected today (Bangladesh day). */
  todaysPaymentsTotal: number;
  currency: string;
}

export interface TeacherAnalytics {
  totalStudents: number;
  avgCourseProgress: number; // 0-100
  avgExamScore: number; // 0-100 (percentage)
  completionRate: number; // 0-100, % of enrolled students who finish a course
}

// ---------------------------------------------------------------------------
// Group Assistant (bot-owned: it manages Telegram groups, not Proggaa data)
// ---------------------------------------------------------------------------

export interface GroupSettings {
  chatId: string;
  welcomeEnabled: boolean;
  faqEnabled: boolean;
  moderationEnabled: boolean;
  /** Extra keywords (beyond the built-in scam/spam patterns) admins want flagged. */
  bannedKeywords: string[];
}

export type ModerationAction = "WARNING" | "TEMP_MUTE" | "ADMIN_ALERT";

export interface ModerationEvent {
  id: string;
  chatId: string;
  telegramId: string;
  reason: string;
  action: ModerationAction;
  createdAt: string; // ISO instant
}
