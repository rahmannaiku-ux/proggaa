import type {
  Achievement,
  AdminStatistics,
  Announcement,
  CalendarEntry,
  CatalogMissionDetail,
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
} from "../../src/types/domain";
import type { ServiceContainer } from "../../src/services/container";
import type { FeedCursor, LinkTokenResult, TelegramLinkService } from "../../src/services/proggaa/interfaces";
import { DeepLinkService } from "../../src/services/deep-links/DeepLinkService";
import { InMemoryGroupService } from "../../src/services/groups/GroupService";
import { AlreadyLinkedError, InvalidOrExpiredTokenError, NotFoundError, UnauthorizedError, ValidationError } from "../../src/services/proggaa/errors";

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

export const MISSION_OUTLINE: MissionOutline = {
  id: "course_physics",
  title: "Physics 1st Paper",
  isFree: false,
  enrolled: true,
  progressPercent: 50,
  operations: [
    { id: "op_vectors", title: "Vectors", patrolCount: 2, completedCount: 1 },
    { id: "op_waves", title: "Waves", patrolCount: 1, completedCount: 0 },
  ],
  resume: { patrolId: "pt_2", title: "Dot product" },
};

export const OPERATION: OperationOutline = {
  id: "op_vectors",
  title: "Vectors",
  missionId: "course_physics",
  missionTitle: "Physics 1st Paper",
  chapters: [
    {
      id: "ch_1",
      title: "Basics",
      classTypes: [
        {
          id: "g_1",
          title: "Foundation Class",
          patrols: [
            { id: "pt_1", title: "Intro_to vectors", durationSeconds: 600, isPreview: false, isLive: false, completed: true, locked: false },
            { id: "pt_2", title: "Dot product", durationSeconds: 900, isPreview: false, isLive: false, completed: false, locked: false },
            { id: "pt_3", title: "Cross product", durationSeconds: 900, isPreview: false, isLive: false, completed: false, locked: true },
          ],
        },
      ],
    },
  ],
};

export const PATROL: PatrolDetail = {
  id: "pt_2",
  title: "Dot product",
  description: "How the dot product works.",
  durationSeconds: 900,
  isLive: false,
  missionId: "course_physics",
  missionTitle: "Physics 1st Paper",
  operationId: "op_vectors",
  operationTitle: "Vectors",
  completed: false,
  watchedSeconds: 120,
  resources: [{ id: "r1", title: "Slides.pdf", type: "PDF", downloadable: true }],
  notes: [],
  previous: { id: "pt_1", title: "Intro_to vectors" },
  next: { id: "pt_3", title: "Cross product" },
  path: "/missions/course_physics/operations/op_vectors/chapters/ch_1/groups/g_1/patrols/pt_2",
};

export const CATALOG_PAID: CatalogMissionDetail = {
  id: "course_chem",
  title: "Chemistry_Basics",
  level: "BEGINNER",
  isFree: false,
  price: 1000,
  finalPrice: 800,
  durationMinutes: 600,
  mentorName: "Kabir Hossain",
  enrolled: false,
  description: "Everything about bonding.",
};
export const CATALOG_FREE: CatalogMissionDetail = { ...CATALOG_PAID, id: "course_free", title: "Study skills", isFree: true, price: 0, finalPrice: 0 };

export const STORE: StoreView = {
  coinBalance: 250,
  items: [
    { id: "item_pdf", title: "Formula sheet", description: "All formulas.", type: "PDF", priceCoins: 100, owned: false },
    { id: "item_big", title: "Exclusive class", description: "A bonus class.", type: "EXCLUSIVE_CLASS", priceCoins: 900, owned: false },
  ],
};

export const CALENDAR: CalendarEntry[] = [
  { id: "cal_1", kind: "live_class", title: "Waves revision", startsAt: hoursFromNow(3), endsAt: hoursFromNow(5), missionTitle: "Physics 1st Paper" },
];
export const LEADERBOARD: LeaderboardView = {
  schedule: "NEVER",
  top: [
    { rank: 1, userId: "u_top", name: "Top Hero", xp: 5000, level: 9, streakDays: 30 },
    { rank: 2, userId: STUDENT.id, name: STUDENT.name, xp: 320, level: 4, streakDays: 12 },
  ],
};
export const MEDALS: Medal[] = [{ id: "m1", missionTitle: "Physics 1st Paper", issuedAt: hoursFromNow(-48), verifyPath: "/certificates/verify/ABC-123" }];
export const ANNOUNCEMENTS: Announcement[] = [{ id: "an1", title: "Class moved", body: "Tomorrow at 5pm.", missionTitle: "Physics 1st Paper", createdAt: hoursFromNow(-2) }];

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
export type Calls = { name: string; args: unknown[] }[];

export function buildFakeContainer(
  overrides: Partial<ServiceContainer> = {}
): ServiceContainer & { link: FakeLinkService; feed: FakeFeed; payments: Payment[]; calls: Calls } {
  const calls: Calls = [];
  const record = (name: string, ...args: unknown[]) => void calls.push({ name, args });
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
    learningService: {
      getMission: async (_u, id) => (id === MISSION_OUTLINE.id ? MISSION_OUTLINE : null),
      getOperation: async (_u, id) => (id === OPERATION.id ? OPERATION : null),
      getPatrol: async (_u, id) => {
        if (id === "pt_3") throw new UnauthorizedError("This Patrol is locked. Enrol in the Mission to open it.");
        return id === PATROL.id ? PATROL : null;
      },
      addNote: async (u, id, text) => record("addNote", u, id, text),
    },
    catalogService: {
      browse: async (_u, o) => ({ page: o.page ?? 1, pageSize: 6, total: 2, missions: [CATALOG_PAID, CATALOG_FREE].filter((m) => !o.query || m.title.toLowerCase().includes(o.query.toLowerCase())) }),
      getMission: async (_u, id) => [CATALOG_PAID, CATALOG_FREE].find((m) => m.id === id) ?? null,
      enrollFree: async (u, id) => record("enrollFree", u, id),
      checkout: async (u, id, coupon): Promise<CheckoutInstructions> => {
        record("checkout", u, id, coupon);
        if (coupon === "BAD") throw new ValidationError("That coupon isn't valid.");
        return { paymentId: "pay_new", amount: coupon ? 500 : 800, currency: "BDT", reference: "PRG-ABC123", receivingNumber: "01700000000", provider: "BKASH", couponCode: coupon, missionTitle: "Chemistry_Basics", fullyDiscounted: coupon === "FREE100" };
      },
      submitTransactionId: async (u, id, txid) => record("submitTransactionId", u, id, txid),
    },
    storeService: {
      getStore: async () => STORE,
      purchase: async (u, id) => {
        record("purchase", u, id);
        const item = STORE.items.find((i) => i.id === id);
        if (!item) throw new NotFoundError("Item");
        if (item.priceCoins > STORE.coinBalance) throw new ValidationError("You don't have enough Proggy Coins.");
        return { itemTitle: item.title };
      },
    },
    communityService: {
      getCalendar: async () => CALENDAR,
      getLeaderboard: async () => LEADERBOARD,
      getMedals: async () => MEDALS,
      getAnnouncements: async () => ANNOUNCEMENTS,
    },
    mentorToolsService: {
      announce: async (u, m, t, b) => record("announce", u, m, t, b),
      grantAccess: async (u, m, who) => {
        record("grantAccess", u, m, who);
        return { heroLabel: who, alreadyEnrolled: false };
      },
      issueMedal: async (u, m, who) => {
        record("issueMedal", u, m, who);
        return { heroLabel: who, alreadyIssued: false };
      },
    },
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
  return Object.assign(container, { link, feed, payments, calls });
}
