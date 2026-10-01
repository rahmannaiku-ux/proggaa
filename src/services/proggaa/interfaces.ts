/**
 * What the Telegram bot asks Proggaa for.
 *
 * These interfaces are the ONLY way bot code reaches Proggaa. In production
 * each one is backed by an Api* class that calls the website's /api/bot/*
 * routes (services/proggaa/api); the tests use in-memory fakes (tests/fakes).
 * Proggaa stays the single source of truth: nothing here creates a second copy
 * of its data.
 *
 * Every method that depends on who is asking takes that person's Proggaa user
 * id as its FIRST argument, taken from the authenticated Telegram link and
 * never from anything the person typed. The website then re-checks that the
 * account is linked and allowed to see what was asked for.
 */

import type {
  Achievement,
  AdminStatistics,
  Announcement,
  CalendarEntry,
  CatalogMissionDetail,
  CatalogPage,
  CheckoutInstructions,
  Course,
  ExamResult,
  ExamSummary,
  FeedNotification,
  LeaderboardView,
  LiveClass,
  LiveExamStatus,
  Medal,
  MissionOutline,
  NotificationCategory,
  NotificationPreferences,
  OperationOutline,
  PatrolDetail,
  Payment,
  ProggaaNotification,
  ProggaaRole,
  ProggaaUser,
  StoreView,
  TeacherAnalytics,
} from "../../types/domain";

export interface ProggaaUserService {
  getUserById(proggaaUserId: string): Promise<ProggaaUser | null>;
  getRole(proggaaUserId: string): Promise<ProggaaRole | null>;
}

export interface ProggaaAchievementService {
  getAchievementsForUser(proggaaUserId: string): Promise<Achievement[]>;
}

export interface ProggaaCourseService {
  /** The Missions this hero is enrolled in. */
  getCoursesForStudent(proggaaUserId: string): Promise<Course[]>;
  /** The Missions this mentor teaches (an admin sees all of them). */
  getCoursesForTeacher(proggaaUserId: string): Promise<Course[]>;
  getTeacherAnalytics(proggaaUserId: string): Promise<TeacherAnalytics>;
}

export interface ProggaaExamService {
  getExamsForStudent(proggaaUserId: string): Promise<ExamSummary[]>;
  getExamsForTeacher(proggaaUserId: string): Promise<ExamSummary[]>;
  getLiveExamsForTeacher(proggaaUserId: string): Promise<LiveExamStatus[]>;
}

export interface ProggaaResultService {
  getResultsForStudent(proggaaUserId: string): Promise<ExamResult[]>;
  getPendingManualGradingCount(proggaaUserId: string, examId: string): Promise<number>;
}

export interface ProggaaPaymentService {
  /** This hero's own payments, newest first. */
  getPaymentsForStudent(proggaaUserId: string): Promise<Payment[]>;
  /** Payments waiting for an admin to verify. Admin only. */
  getPendingPayments(adminProggaaUserId: string): Promise<Payment[]>;
  /** One payment, if it is the caller's own or the caller is an admin. */
  getPayment(proggaaUserId: string, paymentId: string): Promise<Payment | null>;
  /** Approves a payment. Admin only, and only after the admin confirmed. */
  approvePayment(adminProggaaUserId: string, paymentId: string): Promise<Payment>;
  /** Rejects a payment. Admin only, and only after the admin confirmed. */
  rejectPayment(adminProggaaUserId: string, paymentId: string, reason?: string): Promise<Payment>;
}

export interface ProggaaLiveClassService {
  /** Live and upcoming live classes in this hero's Missions, soonest first. */
  getLiveClasses(proggaaUserId: string): Promise<LiveClass[]>;
}

export interface ProggaaNotificationService {
  /** The website's own latest notifications for this person. */
  getRecentNotifications(proggaaUserId: string, limit?: number): Promise<ProggaaNotification[]>;
}

/** Reading a Mission the way a hero does: Operations, then Patrols, then one Patrol. */
export interface ProggaaLearningService {
  getMission(proggaaUserId: string, missionId: string): Promise<MissionOutline | null>;
  getOperation(proggaaUserId: string, operationId: string): Promise<OperationOutline | null>;
  /** Null when the Patrol does not exist; throws UnauthorizedError when it is locked for this hero. */
  getPatrol(proggaaUserId: string, patrolId: string): Promise<PatrolDetail | null>;
  addNote(proggaaUserId: string, patrolId: string, text: string): Promise<void>;
}

/** Finding Missions, enrolling and paying. Prices and rules all come from Proggaa. */
export interface ProggaaCatalogService {
  browse(proggaaUserId: string, options: { query?: string; page?: number }): Promise<CatalogPage>;
  getMission(proggaaUserId: string, missionId: string): Promise<CatalogMissionDetail | null>;
  enrollFree(proggaaUserId: string, missionId: string): Promise<void>;
  /** Starts (or returns the open) payment for a paid Mission. */
  checkout(proggaaUserId: string, missionId: string, couponCode?: string): Promise<CheckoutInstructions>;
  /** Sends the hero's own Transaction ID for their open payment. */
  submitTransactionId(proggaaUserId: string, paymentId: string, transactionId: string): Promise<void>;
}

/** The Proggy Store, paid for in Proggy Coins. */
export interface ProggaaStoreService {
  getStore(proggaaUserId: string): Promise<StoreView>;
  /** Spends coins. The bot only calls this after the hero confirmed. */
  purchase(proggaaUserId: string, itemId: string): Promise<{ itemTitle: string }>;
}

export interface ProggaaCommunityService {
  getCalendar(proggaaUserId: string): Promise<CalendarEntry[]>;
  getLeaderboard(proggaaUserId: string): Promise<LeaderboardView>;
  getMedals(proggaaUserId: string): Promise<Medal[]>;
  getAnnouncements(proggaaUserId: string): Promise<Announcement[]>;
}

/** What a Mentor (or admin) can do from Telegram. Each action is confirmed first and checked by Proggaa. */
export interface ProggaaMentorToolsService {
  announce(mentorProggaaUserId: string, missionId: string, title: string, body: string): Promise<void>;
  /** `identifier` is the hero's email or phone. Returns a short description of what happened. */
  grantAccess(mentorProggaaUserId: string, missionId: string, identifier: string): Promise<{ heroLabel: string; alreadyEnrolled: boolean }>;
  issueMedal(mentorProggaaUserId: string, missionId: string, identifier: string): Promise<{ heroLabel: string; alreadyIssued: boolean }>;
}

/** Where to start reading the website's notification feed from. */
export interface FeedCursor {
  createdAt: string; // ISO instant
  id: string;
}

export interface ProggaaNotificationFeed {
  /** Notifications created after the cursor for people who linked Telegram, oldest first. */
  fetchAfter(cursor: FeedCursor, limit?: number): Promise<FeedNotification[]>;
}

/**
 * Which categories a person muted in Telegram. This is a setting of the bot,
 * not Proggaa data, so the bot stores it itself (services/notifications).
 */
export interface NotificationPreferenceService {
  getPreferences(proggaaUserId: string): Promise<NotificationPreferences>;
  setPreference(
    proggaaUserId: string,
    category: NotificationCategory,
    enabled: boolean
  ): Promise<NotificationPreferences>;
}

export interface ProggaaAdminService {
  getStatistics(adminProggaaUserId: string): Promise<AdminStatistics>;
  listUsers(adminProggaaUserId: string, role?: ProggaaRole): Promise<ProggaaUser[]>;
}

export interface LinkTokenResult {
  proggaaUserId: string;
  role: ProggaaRole;
}

/**
 * Bridges a Telegram numeric user id to a Proggaa account.
 *
 * The website creates a short-lived one-time code in the hero's own signed-in
 * session (Settings > Telegram); the hero sends it to the bot; the bot redeems
 * it here. The bot never sees or asks for a password. One Telegram account
 * links to one Proggaa account and the other way round.
 */
export interface TelegramLinkService {
  /** The linked Proggaa account for a Telegram id, or null if unlinked. */
  getLinkedAccount(telegramId: string): Promise<LinkTokenResult | null>;
  /** Redeems a one-time code for this Telegram id. */
  linkWithToken(telegramId: string, token: string): Promise<LinkTokenResult>;
  /** Removes the link for a Telegram id. */
  unlink(telegramId: string): Promise<void>;
}
