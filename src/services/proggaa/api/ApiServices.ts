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
  OperationOutline,
  PatrolDetail,
  Payment,
  ProggaaNotification,
  ProggaaRole,
  ProggaaUser,
  StoreView,
  TeacherAnalytics,
} from "../../../types/domain";
import type {
  FeedCursor,
  ProggaaAchievementService,
  ProggaaAdminService,
  ProggaaCatalogService,
  ProggaaCommunityService,
  ProggaaCourseService,
  ProggaaExamService,
  ProggaaLearningService,
  ProggaaLiveClassService,
  ProggaaMentorToolsService,
  ProggaaNotificationFeed,
  ProggaaNotificationService,
  ProggaaPaymentService,
  ProggaaResultService,
  ProggaaStoreService,
  ProggaaUserService,
} from "../interfaces";
import { NotFoundError } from "../errors";
import { ApiClient } from "./ApiClient";
import {
  mapAchievement,
  mapAnnouncement,
  mapCalendarItem,
  mapCatalogDetail,
  mapCatalogPage,
  mapCheckout,
  mapCourse,
  mapExam,
  mapFeedItem,
  mapLeaderboard,
  mapLiveClass,
  mapMedal,
  mapMissionOutline,
  mapNotification,
  mapOperationOutline,
  mapPatrol,
  mapPayment,
  mapResult,
  mapRole,
  mapStore,
  mapUser,
  type WebAchievement,
  type WebCalendarItem,
  type WebCatalogMission,
  type WebCheckout,
  type WebCourse,
  type WebExam,
  type WebFeedItem,
  type WebLiveClass,
  type WebMission,
  type WebNotification,
  type WebOperation,
  type WebPatrol,
  type WebPayment,
  type WebResult,
  type WebUser,
} from "./mappers";

/**
 * The real implementations of the bot's Proggaa service interfaces, backed by
 * the website's /api/bot/* routes. Every call forwards the caller's Proggaa
 * user id; the website re-checks that this account is linked and allowed to see
 * what was asked for, so the bot cannot be used to read someone else's data.
 */

const enc = encodeURIComponent;

export class ApiProggaaUserService implements ProggaaUserService {
  constructor(private readonly api: ApiClient) {}

  async getUserById(proggaaUserId: string): Promise<ProggaaUser | null> {
    const user = await this.api.get<WebUser>(`/api/bot/users/${enc(proggaaUserId)}`);
    return user ? mapUser(user) : null;
  }

  async getRole(proggaaUserId: string): Promise<ProggaaRole | null> {
    const user = await this.api.get<WebUser>(`/api/bot/users/${enc(proggaaUserId)}`);
    return user ? mapRole(user.role) : null;
  }
}

export class ApiProggaaAchievementService implements ProggaaAchievementService {
  constructor(private readonly api: ApiClient) {}

  async getAchievementsForUser(proggaaUserId: string): Promise<Achievement[]> {
    const rows = await this.api.get<WebAchievement[]>("/api/bot/achievements", { userId: proggaaUserId });
    return (rows ?? []).map((a) => mapAchievement(a, proggaaUserId));
  }
}

export class ApiProggaaCourseService implements ProggaaCourseService {
  constructor(private readonly api: ApiClient) {}

  async getCoursesForStudent(proggaaUserId: string): Promise<Course[]> {
    const rows = await this.api.get<WebCourse[]>("/api/bot/courses", { userId: proggaaUserId });
    return (rows ?? []).map(mapCourse);
  }

  async getCoursesForTeacher(proggaaUserId: string): Promise<Course[]> {
    const rows = await this.api.get<WebCourse[]>("/api/bot/teacher/courses", { teacherId: proggaaUserId });
    return (rows ?? []).map(mapCourse);
  }

  async getTeacherAnalytics(proggaaUserId: string): Promise<TeacherAnalytics> {
    const courses =
      (await this.api.get<{ id: string }[]>("/api/bot/teacher/courses", { teacherId: proggaaUserId })) ?? [];
    type Row = {
      enrollmentCount: number;
      avgProgressPct: number;
      completionRatePct: number;
      avgExamScorePct: number | null;
      studentsWithGradedAttempts: number;
    };
    const rows = await Promise.all(
      courses.map((c) =>
        this.api.get<Row>(`/api/bot/teacher/courses/${enc(c.id)}/analytics`, { teacherId: proggaaUserId })
      )
    );

    const present = rows.filter((r): r is Row => r !== null);
    // Weighted by head count so one big Mission is not drowned out by small ones.
    const weighted = (pick: (r: Row) => number, weight: (r: Row) => number) => {
      const total = present.reduce((n, r) => n + weight(r), 0);
      return total ? Math.round(present.reduce((n, r) => n + pick(r) * weight(r), 0) / total) : 0;
    };

    return {
      totalStudents: present.reduce((n, r) => n + r.enrollmentCount, 0),
      avgCourseProgress: weighted((r) => r.avgProgressPct, (r) => r.enrollmentCount),
      avgExamScore: weighted(
        (r) => r.avgExamScorePct ?? 0,
        (r) => (r.avgExamScorePct === null ? 0 : r.studentsWithGradedAttempts)
      ),
      completionRate: weighted((r) => r.completionRatePct, (r) => r.enrollmentCount),
    };
  }
}

export class ApiProggaaExamService implements ProggaaExamService {
  constructor(private readonly api: ApiClient) {}

  async getExamsForStudent(proggaaUserId: string): Promise<ExamSummary[]> {
    const rows = await this.api.get<WebExam[]>("/api/bot/exams", { userId: proggaaUserId });
    return (rows ?? []).map((e) => mapExam(e));
  }

  async getExamsForTeacher(proggaaUserId: string): Promise<ExamSummary[]> {
    const rows = await this.api.get<WebExam[]>("/api/bot/teacher/exams", { teacherId: proggaaUserId });
    return (rows ?? []).map((e) => mapExam(e));
  }

  async getLiveExamsForTeacher(proggaaUserId: string): Promise<LiveExamStatus[]> {
    return (await this.api.get<LiveExamStatus[]>("/api/bot/teacher/exams/live", { teacherId: proggaaUserId })) ?? [];
  }
}

export class ApiProggaaResultService implements ProggaaResultService {
  constructor(private readonly api: ApiClient) {}

  async getResultsForStudent(proggaaUserId: string): Promise<ExamResult[]> {
    const rows = await this.api.get<WebResult[]>("/api/bot/results", { userId: proggaaUserId });
    return (rows ?? []).map((r) => mapResult(r, proggaaUserId));
  }

  async getPendingManualGradingCount(proggaaUserId: string, examId: string): Promise<number> {
    const row = await this.api
      .get<{ pendingCount: number }>(`/api/bot/teacher/exams/${enc(examId)}/grading-count`, {
        teacherId: proggaaUserId,
      })
      .catch(() => null);
    return row?.pendingCount ?? 0;
  }
}

export class ApiProggaaPaymentService implements ProggaaPaymentService {
  constructor(private readonly api: ApiClient) {}

  async getPaymentsForStudent(proggaaUserId: string): Promise<Payment[]> {
    const rows = await this.api.get<WebPayment[]>("/api/bot/payments", { userId: proggaaUserId });
    return (rows ?? []).map(mapPayment);
  }

  async getPendingPayments(adminProggaaUserId: string): Promise<Payment[]> {
    const rows = await this.api.get<WebPayment[]>("/api/bot/payments/pending", { userId: adminProggaaUserId });
    return (rows ?? []).map(mapPayment);
  }

  async getPayment(proggaaUserId: string, paymentId: string): Promise<Payment | null> {
    const row = await this.api.get<WebPayment>(`/api/bot/payments/${enc(paymentId)}`, { userId: proggaaUserId });
    return row ? mapPayment(row) : null;
  }

  async approvePayment(adminProggaaUserId: string, paymentId: string): Promise<Payment> {
    await this.api.post(`/api/bot/payments/${enc(paymentId)}/approve`, { adminUserId: adminProggaaUserId });
    return this.refetch(adminProggaaUserId, paymentId);
  }

  async rejectPayment(adminProggaaUserId: string, paymentId: string, reason?: string): Promise<Payment> {
    await this.api.post(`/api/bot/payments/${enc(paymentId)}/reject`, {
      adminUserId: adminProggaaUserId,
      reason: reason?.trim() || "Rejected by an admin from Telegram.",
    });
    return this.refetch(adminProggaaUserId, paymentId);
  }

  private async refetch(proggaaUserId: string, paymentId: string): Promise<Payment> {
    const payment = await this.getPayment(proggaaUserId, paymentId);
    if (!payment) throw new NotFoundError("Payment");
    return payment;
  }
}

export class ApiProggaaLiveClassService implements ProggaaLiveClassService {
  constructor(private readonly api: ApiClient) {}

  async getLiveClasses(proggaaUserId: string): Promise<LiveClass[]> {
    const rows = await this.api.get<WebLiveClass[]>("/api/bot/live-classes", { userId: proggaaUserId });
    return (rows ?? []).map(mapLiveClass);
  }
}

export class ApiProggaaNotificationService implements ProggaaNotificationService {
  constructor(private readonly api: ApiClient) {}

  async getRecentNotifications(proggaaUserId: string, limit = 10): Promise<ProggaaNotification[]> {
    const rows = await this.api.get<WebNotification[]>("/api/bot/notifications", { userId: proggaaUserId, limit });
    return (rows ?? []).map(mapNotification);
  }
}

export class ApiProggaaNotificationFeed implements ProggaaNotificationFeed {
  constructor(private readonly api: ApiClient) {}

  async fetchAfter(cursor: FeedCursor, limit = 50): Promise<FeedNotification[]> {
    const rows = await this.api.get<WebFeedItem[]>("/api/bot/notifications/feed", {
      after: cursor.createdAt,
      afterId: cursor.id,
      limit,
    });
    return (rows ?? []).map(mapFeedItem);
  }
}

export class ApiProggaaAdminService implements ProggaaAdminService {
  constructor(private readonly api: ApiClient) {}

  async getStatistics(adminProggaaUserId: string): Promise<AdminStatistics> {
    const row = await this.api.get<{
      studentCount: number;
      teacherCount: number;
      courseCount: number;
      examCount: number;
      liveExamCount: number;
      todaysPaymentsCents: number;
      currency: string;
    }>("/api/bot/admin/statistics", { userId: adminProggaaUserId });
    if (!row) throw new NotFoundError("Statistics");
    const { todaysPaymentsCents, ...rest } = row;
    return { ...rest, todaysPaymentsTotal: todaysPaymentsCents / 100 };
  }

  async listUsers(adminProggaaUserId: string, role?: ProggaaRole): Promise<ProggaaUser[]> {
    const rows = await this.api.get<WebUser[]>("/api/bot/admin/users", {
      userId: adminProggaaUserId,
      // The website has SUPER_ADMIN and ADMIN; the bot calls both "ADMIN", so filter here.
      role: role === "ADMIN" ? undefined : role,
    });
    const users = (rows ?? []).map(mapUser);
    return role ? users.filter((u) => u.role === role) : users;
  }
}

export class ApiProggaaLearningService implements ProggaaLearningService {
  constructor(private readonly api: ApiClient) {}

  async getMission(proggaaUserId: string, missionId: string): Promise<MissionOutline | null> {
    const m = await this.api.get<WebMission>(`/api/bot/missions/${enc(missionId)}`, { userId: proggaaUserId });
    return m ? mapMissionOutline(m) : null;
  }

  async getOperation(proggaaUserId: string, operationId: string): Promise<OperationOutline | null> {
    const o = await this.api.get<WebOperation>(`/api/bot/operations/${enc(operationId)}`, { userId: proggaaUserId });
    return o ? mapOperationOutline(o) : null;
  }

  async getPatrol(proggaaUserId: string, patrolId: string): Promise<PatrolDetail | null> {
    const p = await this.api.get<WebPatrol>(`/api/bot/patrols/${enc(patrolId)}`, { userId: proggaaUserId });
    return p ? mapPatrol(p) : null;
  }

  async addNote(proggaaUserId: string, patrolId: string, text: string): Promise<void> {
    await this.api.post(`/api/bot/patrols/${enc(patrolId)}/note`, { userId: proggaaUserId, text });
  }
}

export class ApiProggaaCatalogService implements ProggaaCatalogService {
  constructor(private readonly api: ApiClient) {}

  async browse(proggaaUserId: string, options: { query?: string; page?: number }): Promise<CatalogPage> {
    const r = await this.api.get<{ page: number; pageSize: number; total: number; missions: WebCatalogMission[] }>("/api/bot/catalog", {
      userId: proggaaUserId,
      q: options.query,
      page: options.page,
    });
    return mapCatalogPage(r ?? { page: 1, pageSize: 6, total: 0, missions: [] });
  }

  async getMission(proggaaUserId: string, missionId: string): Promise<CatalogMissionDetail | null> {
    const m = await this.api.get<WebCatalogMission>(`/api/bot/catalog/${enc(missionId)}`, { userId: proggaaUserId });
    return m ? mapCatalogDetail(m) : null;
  }

  async enrollFree(proggaaUserId: string, missionId: string): Promise<void> {
    await this.api.post(`/api/bot/missions/${enc(missionId)}/enroll`, { userId: proggaaUserId });
  }

  async checkout(proggaaUserId: string, missionId: string, couponCode?: string): Promise<CheckoutInstructions> {
    const p = await this.api.post<WebCheckout>(`/api/bot/missions/${enc(missionId)}/checkout`, {
      userId: proggaaUserId,
      ...(couponCode ? { couponCode } : {}),
    });
    return mapCheckout(p);
  }

  async submitTransactionId(proggaaUserId: string, paymentId: string, transactionId: string): Promise<void> {
    await this.api.post(`/api/bot/payments/${enc(paymentId)}/txid`, { userId: proggaaUserId, transactionId });
  }
}

export class ApiProggaaStoreService implements ProggaaStoreService {
  constructor(private readonly api: ApiClient) {}

  async getStore(proggaaUserId: string): Promise<StoreView> {
    const r = await this.api.get<Parameters<typeof mapStore>[0]>("/api/bot/store", { userId: proggaaUserId });
    return mapStore(r ?? { coinBalance: 0, items: [] });
  }

  async purchase(proggaaUserId: string, itemId: string): Promise<{ itemTitle: string }> {
    const r = await this.api.post<{ itemTitle: string }>("/api/bot/store/purchase", { userId: proggaaUserId, itemId });
    return { itemTitle: r.itemTitle };
  }
}

export class ApiProggaaCommunityService implements ProggaaCommunityService {
  constructor(private readonly api: ApiClient) {}

  async getCalendar(proggaaUserId: string): Promise<CalendarEntry[]> {
    const rows = await this.api.get<WebCalendarItem[]>("/api/bot/calendar", { userId: proggaaUserId });
    return (rows ?? []).map(mapCalendarItem);
  }

  async getLeaderboard(proggaaUserId: string): Promise<LeaderboardView> {
    const r = await this.api.get<Parameters<typeof mapLeaderboard>[0]>("/api/bot/leaderboard", { userId: proggaaUserId });
    return mapLeaderboard(r ?? { schedule: "NEVER", top: [], me: null });
  }

  async getMedals(proggaaUserId: string): Promise<Medal[]> {
    const rows = await this.api.get<Parameters<typeof mapMedal>[0][]>("/api/bot/medals", { userId: proggaaUserId });
    return (rows ?? []).map(mapMedal);
  }

  async getAnnouncements(proggaaUserId: string): Promise<Announcement[]> {
    const rows = await this.api.get<Parameters<typeof mapAnnouncement>[0][]>("/api/bot/announcements", { userId: proggaaUserId });
    return (rows ?? []).map(mapAnnouncement);
  }
}

export class ApiProggaaMentorToolsService implements ProggaaMentorToolsService {
  constructor(private readonly api: ApiClient) {}

  async announce(mentorProggaaUserId: string, missionId: string, title: string, body: string): Promise<void> {
    await this.api.post("/api/bot/mentor/announcements", { mentorId: mentorProggaaUserId, missionId, title, body });
  }

  async grantAccess(mentorProggaaUserId: string, missionId: string, identifier: string) {
    const r = await this.api.post<{ studentLabel: string; alreadyEnrolled: boolean }>("/api/bot/mentor/access", {
      mentorId: mentorProggaaUserId,
      action: "grant",
      missionId,
      identifier,
    });
    return { heroLabel: r.studentLabel, alreadyEnrolled: r.alreadyEnrolled };
  }

  async issueMedal(mentorProggaaUserId: string, missionId: string, identifier: string) {
    const r = await this.api.post<{ studentLabel: string; alreadyIssued: boolean }>("/api/bot/mentor/access", {
      mentorId: mentorProggaaUserId,
      action: "medal",
      missionId,
      identifier,
    });
    return { heroLabel: r.studentLabel, alreadyIssued: r.alreadyIssued };
  }
}
