import type {
  Achievement,
  AdminStatistics,
  Course,
  ExamResult,
  ExamSummary,
  FeedNotification,
  LiveClass,
  LiveExamStatus,
  NotificationCategory,
  NotificationPreferences,
  Payment,
  ProggaaNotification,
  ProggaaRole,
  ProggaaUser,
  TeacherAnalytics,
} from "../../src/types/domain";
import type { ServiceContainer } from "../../src/services/container";
import type { FeedCursor, LinkTokenResult, TelegramLinkService } from "../../src/services/proggaa/interfaces";
import { DeepLinkService } from "../../src/services/deep-links/DeepLinkService";
import { InMemoryGroupService } from "../../src/services/groups/GroupService";
import { AlreadyLinkedError, InvalidOrExpiredTokenError, NotFoundError, UnauthorizedError } from "../../src/services/proggaa/errors";

/**
 * In-memory stand-ins for Proggaa, used only by the tests. Production code has
 * no demo mode: the bot always talks to the real website.
 */

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export const STUDENT: ProggaaUser = {
  id: "user_student_1",
  name: "Ayesha Rahman",
  role: "STUDENT",
  xp: 320,
  level: 4,
  xpIntoLevel: 40,
  xpForNextLevel: 120,
  streakDays: 12,
  coinBalance: 250,
};
export const TEACHER: ProggaaUser = { ...STUDENT, id: "user_teacher_1", name: "Kabir Hossain", role: "TEACHER", xp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 50, streakDays: 0, coinBalance: 0 };
export const ADMIN: ProggaaUser = { ...TEACHER, id: "user_admin_1", name: "Nabila Islam", role: "ADMIN" };
export const USERS = [STUDENT, TEACHER, ADMIN];

export const COURSES: Course[] = [
  { id: "course_physics", name: "Physics 1st Paper", progressPercent: 68 },
  { id: "course_chem", name: "Chemistry_Basics", progressPercent: 41 },
];

export const EXAMS: ExamSummary[] = [
  { id: "exam_mid", courseId: "course_physics", courseName: "Physics 1st Paper", title: "Physics Midterm", status: "STARTING_SOON", startsAt: hoursFromNow(2), durationMinutes: 45 },
  { id: "exam_old", courseId: "course_physics", courseName: "Physics 1st Paper", title: "Chapter 4 Test", status: "COMPLETED", startsAt: hoursFromNow(-120), durationMinutes: 30 },
];

export const RESULTS: ExamResult[] = [
  { id: "result_1", examId: "exam_old", examTitle: "Chapter 4 Test", userId: STUDENT.id, score: 42, maxScore: 50, percentage: 84, grade: "A+", publishedAt: hoursFromNow(-100) },
];

export const ACHIEVEMENTS: Achievement[] = [
  { id: "ach_1", userId: STUDENT.id, name: "Perfect Score", description: "Score 100% on any Encounter.", xpAwarded: 100, unlockedAt: hoursFromNow(-240) },
];

export const LIVE_CLASSES: LiveClass[] = [
  { id: "patrol_1", title: "Waves revision", missionId: "course_physics", missionTitle: "Physics 1st Paper", status: "UPCOMING", startsAt: hoursFromNow(3), endsAt: hoursFromNow(5), path: "/missions/course_physics/operations/o1/chapters/c1/groups/g1/patrols/patrol_1" },
];

export const LIVE_EXAMS: LiveExamStatus[] = [
  { examId: "exam_mid", examTitle: "Physics Midterm", totalStudents: 82, activeStudents: 11, submittedStudents: 71, suspiciousEvents: 3 },
];

export const STATS: AdminStatistics = { studentCount: 1248, teacherCount: 82, courseCount: 126, examCount: 342, liveExamCount: 1, todaysPaymentsTotal: 48500, currency: "BDT" };

export function freshPayments(): Payment[] {
  return [
    { id: "pay_1", studentId: STUDENT.id, studentName: STUDENT.name, courseId: "course_physics", courseName: "Physics 1st Paper", amount: 500, currency: "BDT", transactionId: "ABC123XYZ", status: "PENDING", createdAt: new Date().toISOString() },
  ];
}

export class FakeLinkService implements TelegramLinkService {
  private readonly links = new Map<string, LinkTokenResult>();
  private readonly tokens = new Map<string, { userId: string; expiresAt: number; used: boolean }>();
  attempts: string[] = [];

  /** Issues a code the way the website does (XXXX-XXXX-XXXX). */
  issueToken(userId: string, ttlMs = 10 * 60_000): string {
    const code = `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    this.tokens.set(code, { userId, expiresAt: Date.now() + ttlMs, used: false });
    return code;
  }

  async getLinkedAccount(telegramId: string) {
    return this.links.get(telegramId) ?? null;
  }

  async linkWithToken(telegramId: string, token: string): Promise<LinkTokenResult> {
    this.attempts.push(token);
    const row = this.tokens.get(token);
    if (!row || row.used || row.expiresAt < Date.now()) throw new InvalidOrExpiredTokenError();
    if (this.links.has(telegramId)) throw new AlreadyLinkedError();
    row.used = true; // a code works once
    const user = USERS.find((u) => u.id === row.userId)!;
    const result = { proggaaUserId: user.id, role: user.role as ProggaaRole };
    this.links.set(telegramId, result);
    return result;
  }

  async unlink(telegramId: string) {
    this.links.delete(telegramId);
  }
}

export class FakePreferences {
  private readonly store = new Map<string, NotificationPreferences>();

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.store.get(userId) ?? { userId, categories: Object.fromEntries(ALL.map((c) => [c, true])) as Record<NotificationCategory, boolean> };
  }

  async setPreference(userId: string, category: NotificationCategory, enabled: boolean) {
    const prefs = await this.getPreferences(userId);
    prefs.categories[category] = enabled;
    this.store.set(userId, prefs);
    return prefs;
  }
}

const ALL: NotificationCategory[] = ["EXAM_REMINDERS", "RESULTS", "LIVE_CLASSES", "ANNOUNCEMENTS", "MISSIONS", "CHALLENGES", "ACHIEVEMENTS", "STREAK", "PAYMENTS", "SYSTEM"];

export class FakeFeed {
  items: FeedNotification[] = [];
  calls: FeedCursor[] = [];

  async fetchAfter(cursor: FeedCursor, limit = 50): Promise<FeedNotification[]> {
    this.calls.push(cursor);
    return this.items
      .filter((n) => n.createdAt > cursor.createdAt || (n.createdAt === cursor.createdAt && n.id > cursor.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}

/** Who may do what, mirroring the website's checks, so authorization tests are meaningful. */
export function buildFakeContainer(overrides: Partial<ServiceContainer> = {}): ServiceContainer & { link: FakeLinkService; feed: FakeFeed; payments: Payment[] } {
  const link = new FakeLinkService();
  const feed = new FakeFeed();
  const payments = freshPayments();
  const isAdmin = (id: string) => USERS.find((u) => u.id === id)?.role === "ADMIN";

  const container: ServiceContainer = {
    userService: {
      getUserById: async (id) => USERS.find((u) => u.id === id) ?? null,
      getRole: async (id) => USERS.find((u) => u.id === id)?.role ?? null,
    },
    courseService: {
      getCoursesForStudent: async () => COURSES,
      getCoursesForTeacher: async () => COURSES,
      getTeacherAnalytics: async (): Promise<TeacherAnalytics> => ({ totalStudents: 40, avgCourseProgress: 55, avgExamScore: 70, completionRate: 30 }),
    },
    examService: {
      getExamsForStudent: async () => EXAMS,
      getExamsForTeacher: async () => EXAMS,
      getLiveExamsForTeacher: async () => LIVE_EXAMS,
    },
    resultService: {
      getResultsForStudent: async () => RESULTS,
      getPendingManualGradingCount: async () => 3,
    },
    paymentService: {
      getPaymentsForStudent: async (id) => payments.filter((p) => p.studentId === id),
      getPendingPayments: async (id) => {
        if (!isAdmin(id)) throw new UnauthorizedError("Admin access required.");
        return payments.filter((p) => p.status === "PENDING");
      },
      getPayment: async (id, paymentId) => {
        const p = payments.find((x) => x.id === paymentId);
        return p && (p.studentId === id || isAdmin(id)) ? p : null;
      },
      approvePayment: async (id, paymentId) => {
        if (!isAdmin(id)) throw new UnauthorizedError("Admin access required.");
        const p = payments.find((x) => x.id === paymentId);
        if (!p) throw new NotFoundError("Payment");
        p.status = "APPROVED";
        return p;
      },
      rejectPayment: async (id, paymentId) => {
        if (!isAdmin(id)) throw new UnauthorizedError("Admin access required.");
        const p = payments.find((x) => x.id === paymentId);
        if (!p) throw new NotFoundError("Payment");
        p.status = "REJECTED";
        return p;
      },
    },
    liveClassService: { getLiveClasses: async () => LIVE_CLASSES },
    notificationService: {
      getRecentNotifications: async (): Promise<ProggaaNotification[]> => [
        { id: "n1", category: "RESULTS", title: "Result posted", body: "Chapter 4 Test: 84%", createdAt: hoursFromNow(-1) },
      ],
    },
    notificationFeed: feed,
    preferenceService: new FakePreferences(),
    achievementService: { getAchievementsForUser: async () => ACHIEVEMENTS },
    adminService: {
      getStatistics: async (id) => {
        if (!isAdmin(id)) throw new UnauthorizedError("Admin access required.");
        return STATS;
      },
      listUsers: async (id, role) => {
        if (!isAdmin(id)) throw new UnauthorizedError("Admin access required.");
        return role ? USERS.filter((u) => u.role === role) : USERS;
      },
    },
    linkService: link,
    deepLinkService: new DeepLinkService("https://proggaa.example"),
    groupService: new InMemoryGroupService(),
    ...overrides,
  };
  return Object.assign(container, { link, feed, payments });
}
