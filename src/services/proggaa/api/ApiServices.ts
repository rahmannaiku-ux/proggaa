import type {
  Achievement,
  AdminStatistics,
  Course,
  ExamResult,
  ExamSummary,
  LiveExamStatus,
  NotificationEvent,
  Payment,
  ProggaaRole,
  ProggaaUser,
  SystemAlert,
  TeacherAnalytics,
} from "../../../types/domain";
import type {
  ProggaaAchievementService,
  ProggaaAdminService,
  ProggaaCourseService,
  ProggaaExamService,
  ProggaaNotificationService,
  ProggaaPaymentService,
  ProggaaResultService,
  ProggaaUserService,
} from "../interfaces";
import { ProggaaServiceError } from "../errors";
import { ApiClient } from "./ApiClient";
import {
  mapAchievement,
  mapCourse,
  mapExam,
  mapNotification,
  mapPayment,
  mapResult,
  mapRole,
  mapUser,
  type WebAchievement,
  type WebCourse,
  type WebExam,
  type WebNotification,
  type WebPayment,
  type WebResult,
  type WebUser,
} from "./mappers";

/**
 * Real implementations of the bot's Proggaa service interfaces, backed by the
 * website's /api/bot/* routes. Every method forwards the caller's Proggaa user
 * id, and the website re-checks that this account is linked and allowed to see
 * the thing it asked for, so the bot cannot be used to read someone else's data.
 */

export class ApiProggaaUserService implements ProggaaUserService {
  constructor(private readonly api: ApiClient) {}

  async getUserById(proggaaUserId: string): Promise<ProggaaUser | null> {
    const user = await this.api.get<WebUser>(`/api/bot/users/${encodeURIComponent(proggaaUserId)}`);
    return user ? mapUser(user) : null;
  }

  async getRole(proggaaUserId: string): Promise<ProggaaRole | null> {
    const user = await this.api.get<WebUser>(`/api/bot/users/${encodeURIComponent(proggaaUserId)}`);
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

  async getCourseById(courseId: string, proggaaUserId?: string): Promise<Course | null> {
    const id = encodeURIComponent(courseId);
    // A teacher asking about one of their own courses gets the owner check;
    // anyone else only ever sees published courses.
    const course = proggaaUserId
      ? await this.api.get<WebCourse>(`/api/bot/teacher/courses/${id}`, { teacherId: proggaaUserId }).catch(() => null)
      : null;
    const found = course ?? (await this.api.get<WebCourse>(`/api/bot/courses/${id}`));
    return found ? mapCourse(found) : null;
  }

  async getTeacherAnalytics(proggaaUserId: string): Promise<TeacherAnalytics> {
    const courses = (await this.api.get<{ id: string }[]>("/api/bot/teacher/courses", { teacherId: proggaaUserId })) ?? [];
    const rows = await Promise.all(
      courses.map((c) =>
        this.api.get<{
          enrollmentCount: number;
          avgProgressPct: number;
          completionRatePct: number;
          avgExamScorePct: number | null;
          studentsWithGradedAttempts: number;
        }>(`/api/bot/teacher/courses/${encodeURIComponent(c.id)}/analytics`, { teacherId: proggaaUserId })
      )
    );

    const present = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    const totalStudents = present.reduce((n, r) => n + r.enrollmentCount, 0);
    // Weighted by head count so one big course is not drowned out by small ones.
    const weighted = (pick: (r: (typeof present)[number]) => number, weight: (r: (typeof present)[number]) => number) => {
      const w = present.reduce((n, r) => n + weight(r), 0);
      return w ? Math.round(present.reduce((n, r) => n + pick(r) * weight(r), 0) / w) : 0;
    };

    return {
      totalStudents,
      avgCourseProgress: weighted((r) => r.avgProgressPct, (r) => r.enrollmentCount),
      avgExamScore: weighted((r) => r.avgExamScorePct ?? 0, (r) => (r.avgExamScorePct === null ? 0 : r.studentsWithGradedAttempts)),
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

  async getExamById(examId: string, proggaaUserId?: string): Promise<ExamSummary | null> {
    if (!proggaaUserId) return null; // the website only shows an exam to someone enrolled in its course
    const id = encodeURIComponent(examId);
    const exam = await this.api
      .get<WebExam>(`/api/bot/exams/${id}`, { userId: proggaaUserId })
      .catch(() => null);
    const found = exam ?? (await this.api.get<WebExam>(`/api/bot/teacher/exams/${id}`, { teacherId: proggaaUserId }).catch(() => null));
    return found ? mapExam(found) : null;
  }

  async getLiveExamStatus(examId: string, proggaaUserId?: string): Promise<LiveExamStatus | null> {
    if (!proggaaUserId) return null;
    const rows = await this.api.get<LiveExamStatus[]>("/api/bot/teacher/exams/live", { teacherId: proggaaUserId, examId });
    return rows?.[0] ?? null;
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

  async getResultById(resultId: string, proggaaUserId?: string): Promise<ExamResult | null> {
    if (!proggaaUserId) return null;
    const row = await this.api.get<WebResult>(`/api/bot/results/${encodeURIComponent(resultId)}`, { userId: proggaaUserId });
    return row ? mapResult(row, proggaaUserId) : null;
  }

  async getPendingManualGradingCount(examId: string, proggaaUserId?: string): Promise<number> {
    if (!proggaaUserId) return 0;
    const row = await this.api
      .get<{ pendingCount: number }>(`/api/bot/teacher/exams/${encodeURIComponent(examId)}/grading-count`, { teacherId: proggaaUserId })
      .catch(() => null);
    return row?.pendingCount ?? 0;
  }
}

export class ApiProggaaPaymentService implements ProggaaPaymentService {
  constructor(private readonly api: ApiClient) {}

  async getPendingPayments(proggaaUserId?: string): Promise<Payment[]> {
    if (!proggaaUserId) return [];
    const rows = await this.api.get<WebPayment[]>("/api/bot/payments/pending", { userId: proggaaUserId });
    return (rows ?? []).map((p) => mapPayment(p));
  }

  async getPaymentById(paymentId: string, proggaaUserId?: string): Promise<Payment | null> {
    if (!proggaaUserId) return null;
    const row = await this.api.get<WebPayment>(`/api/bot/payments/${encodeURIComponent(paymentId)}`, { userId: proggaaUserId });
    return row ? mapPayment(row) : null;
  }

  async getPaymentsForStudent(proggaaUserId: string): Promise<Payment[]> {
    const rows = await this.api.get<WebPayment[]>("/api/bot/payments", { userId: proggaaUserId });
    return (rows ?? []).map((p) => mapPayment(p));
  }

  async submitTransactionId(): Promise<Payment> {
    // The website checks the TXID against the payment device and the order,
    // and that flow is only reachable from a signed-in browser session.
    throw new ProggaaServiceError(
      "Please send your Transaction ID from the payment page on the Proggaa website.",
      "NOT_SUPPORTED"
    );
  }

  async approvePayment(paymentId: string, approvedByProggaaUserId: string): Promise<Payment> {
    await this.api.post(`/api/bot/payments/${encodeURIComponent(paymentId)}/approve`, {
      adminUserId: approvedByProggaaUserId,
    });
    return this.refetch(paymentId, approvedByProggaaUserId);
  }

  async rejectPayment(paymentId: string, rejectedByProggaaUserId: string, reason?: string): Promise<Payment> {
    await this.api.post(`/api/bot/payments/${encodeURIComponent(paymentId)}/reject`, {
      adminUserId: rejectedByProggaaUserId,
      reason: reason?.trim() || "Rejected by an admin from Telegram.",
    });
    return this.refetch(paymentId, rejectedByProggaaUserId);
  }

  private async refetch(paymentId: string, proggaaUserId: string): Promise<Payment> {
    const payment = await this.getPaymentById(paymentId, proggaaUserId);
    if (!payment) throw new ProggaaServiceError("Payment not found.", "NOT_FOUND");
    return payment;
  }
}

export class ApiProggaaNotificationService implements ProggaaNotificationService {
  constructor(private readonly api: ApiClient) {}

  async getRecentNotifications(proggaaUserId: string, limit = 10): Promise<NotificationEvent[]> {
    const rows = await this.api.get<WebNotification[]>("/api/bot/notifications", { userId: proggaaUserId, limit });
    return (rows ?? []).map((n) => mapNotification(n, proggaaUserId));
  }

  /**
   * Notifications already live on the website, so there is nothing to store
   * here. The wrapper in the container pushes the event to Telegram.
   */
  async dispatch(): Promise<void> {
    return;
  }
}

export class ApiProggaaAdminService implements ProggaaAdminService {
  constructor(private readonly api: ApiClient) {}

  async getStatistics(adminProggaaUserId?: string): Promise<AdminStatistics> {
    const row = await this.api.get<{
      studentCount: number;
      teacherCount: number;
      courseCount: number;
      examCount: number;
      liveExamCount: number;
      todaysPaymentsCents: number;
      currency: string;
    }>("/api/bot/admin/statistics", { userId: adminProggaaUserId });
    if (!row) throw new ProggaaServiceError("Statistics are not available.", "NOT_FOUND");
    const { todaysPaymentsCents, ...rest } = row;
    return { ...rest, todaysPaymentsTotal: todaysPaymentsCents / 100 };
  }

  async listUsers(role?: ProggaaRole, adminProggaaUserId?: string): Promise<ProggaaUser[]> {
    const rows = await this.api.get<WebUser[]>("/api/bot/admin/users", {
      userId: adminProggaaUserId,
      role: role === "ADMIN" ? undefined : role,
    });
    const users = (rows ?? []).map(mapUser);
    return role ? users.filter((u) => u.role === role) : users;
  }

  async disqualifyStudent(): Promise<void> {
    throw new ProggaaServiceError(
      "Disqualifying a student is done from the exam monitor on the Proggaa website.",
      "NOT_SUPPORTED"
    );
  }

  async getAlerts(): Promise<SystemAlert[]> {
    return [];
  }
}
