/**
 * Proggaa Integration Adapter — service interfaces.
 *
 * These interfaces are the ONLY way the Telegram bot talks to "Proggaa".
 * Today every one of them is backed by an in-memory Mock*Service.
 * Later, each can be swapped for an Api*Service that calls the real
 * Proggaa backend — the bot code never needs to change, because it only
 * ever depends on these interfaces (see services/container.ts).
 */

import type {
  Achievement,
  AdminStatistics,
  AIGenerationRequest,
  AIGenerationResult,
  Course,
  ExamResult,
  ExamSummary,
  LiveExamStatus,
  NotificationCategory,
  NotificationEvent,
  NotificationPreferences,
  Payment,
  ProggaaRole,
  ProggaaUser,
  Question,
  QuestionDifficulty,
  QuestionType,
  SupportCategory,
  SupportTicket,
  SupportTicketContext,
  SupportTicketPriority,
  SupportTicketStatus,
  SystemAlert,
  TeacherAnalytics,
  TutorRequest,
} from "../../types/domain";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface ProggaaUserService {
  getUserById(proggaaUserId: string): Promise<ProggaaUser | null>;
  getRole(proggaaUserId: string): Promise<ProggaaRole | null>;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/**
 * Not in the original core list, but Achievement is a first-class domain
 * type the student dashboard/achievements screen needs — given the same
 * interface + mock/api treatment as everything else.
 */
export interface ProggaaAchievementService {
  getAchievementsForUser(proggaaUserId: string): Promise<Achievement[]>;
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export interface ProggaaCourseService {
  getCoursesForStudent(proggaaUserId: string): Promise<Course[]>;
  getCoursesForTeacher(proggaaUserId: string): Promise<Course[]>;
  getCourseById(courseId: string): Promise<Course | null>;
  /**
   * Aggregate teacher-facing analytics. Lives here rather than as a
   * separate service because, with the current mock data's granularity
   * (no per-student records), course-level progress data is the only
   * input available — a future `ApiProggaaCourseService` can compute
   * this however the real backend does.
   */
  getTeacherAnalytics(proggaaUserId: string): Promise<TeacherAnalytics>;
}

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export interface ProggaaExamService {
  getExamsForStudent(proggaaUserId: string): Promise<ExamSummary[]>;
  getExamsForTeacher(proggaaUserId: string): Promise<ExamSummary[]>;
  getExamById(examId: string): Promise<ExamSummary | null>;
  getLiveExamStatus(examId: string): Promise<LiveExamStatus | null>;
  getLiveExamsForTeacher(proggaaUserId: string): Promise<LiveExamStatus[]>;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface ProggaaResultService {
  getResultsForStudent(proggaaUserId: string): Promise<ExamResult[]>;
  getResultById(resultId: string): Promise<ExamResult | null>;
  getPendingManualGradingCount(examId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface ProggaaPaymentService {
  getPendingPayments(): Promise<Payment[]>;
  getPaymentById(paymentId: string): Promise<Payment | null>;
  /** All payments (any status) submitted by this student, most recent first. */
  getPaymentsForStudent(proggaaUserId: string): Promise<Payment[]>;
  /**
   * Records a student-submitted TXID against a payment awaiting one.
   * This never marks a payment paid — it only attaches the reference for
   * an admin/the payment gateway to verify; status stays PENDING.
   */
  submitTransactionId(paymentId: string, proggaaUserId: string, transactionId: string): Promise<Payment>;
  /** Approves a pending payment. Must be called only after admin confirmation. */
  approvePayment(paymentId: string, approvedByProggaaUserId: string): Promise<Payment>;
  /** Rejects a pending payment. Must be called only after admin confirmation. */
  rejectPayment(paymentId: string, rejectedByProggaaUserId: string, reason?: string): Promise<Payment>;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface ProggaaNotificationService {
  /** Fetch recent notifications to display in-bot (e.g. via /notifications). */
  getRecentNotifications(proggaaUserId: string, limit?: number): Promise<NotificationEvent[]>;
  /** Called by the notification pipeline when a Proggaa-side event happens. */
  dispatch(event: NotificationEvent): Promise<void>;
}

export interface NotificationPreferenceService {
  getPreferences(proggaaUserId: string): Promise<NotificationPreferences>;
  setPreference(
    proggaaUserId: string,
    category: NotificationCategory,
    enabled: boolean
  ): Promise<NotificationPreferences>;
}

// ---------------------------------------------------------------------------
// AI (future question generation)
// ---------------------------------------------------------------------------

export interface ProggaaAIService {
  generateMCQ(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult>;
  generateNumerical(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult>;
  generateShortAnswer(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult>;
  generateMixedExam(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult>;
  generateFromText(sourceText: string, questionType: QuestionType, count: number): Promise<AIGenerationResult>;
  generateFromPDF(fileRef: string, questionType: QuestionType, count: number): Promise<AIGenerationResult>;
  /** Student-facing tutoring (explain/summarize/hint/flashcards/revision). See TutorMode. */
  tutor(request: TutorRequest): Promise<string>;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface ProggaaAdminService {
  getStatistics(): Promise<AdminStatistics>;
  listUsers(role?: ProggaaRole): Promise<ProggaaUser[]>;
  disqualifyStudent(examId: string, studentId: string, adminProggaaUserId: string, reason: string): Promise<void>;
  getAlerts(): Promise<SystemAlert[]>;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/**
 * Sending an announcement is listed explicitly as a sensitive action in
 * the spec's security section (requires confirmation, same tier as
 * payment approval/rejection and exam publishing) — so it gets its own
 * interface rather than being folded into notifications.
 */
export interface AnnouncementService {
  sendAnnouncement(
    courseId: string,
    teacherProggaaUserId: string,
    message: string
  ): Promise<{ recipientCount: number }>;
}

// ---------------------------------------------------------------------------
// Question Bank
// ---------------------------------------------------------------------------

export interface QuestionBankService {
  searchQuestions(query: { topic?: string; type?: QuestionType; difficulty?: QuestionDifficulty }): Promise<Question[]>;
  getQuestion(questionId: string): Promise<Question | null>;
  addQuestionToExam(questionId: string, examId: string): Promise<void>;
  createQuestion(question: Omit<Question, "id">): Promise<Question>;
  deleteQuestion(questionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

export interface SupportService {
  createTicket(
    proggaaUserId: string,
    category: SupportCategory,
    message: string,
    options?: { priority?: SupportTicketPriority; context?: SupportTicketContext }
  ): Promise<SupportTicket>;
  getTicketsForUser(proggaaUserId: string): Promise<SupportTicket[]>;
  getTicket(ticketId: string): Promise<SupportTicket | null>;
  /** Appends a message to the thread. Reopens a RESOLVED/CLOSED ticket when a student replies. */
  addMessage(
    ticketId: string,
    author: "STUDENT" | "STAFF",
    authorName: string,
    body: string
  ): Promise<SupportTicket>;
  setStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket>;
  assignTicket(ticketId: string, staffUserId: string, staffName: string): Promise<SupportTicket>;
  /** All tickets, optionally filtered — used by teacher/admin queues. */
  listTickets(filter?: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    category?: SupportCategory;
    assignedToUserId?: string;
  }): Promise<SupportTicket[]>;
}

// ---------------------------------------------------------------------------
// Account linking
// ---------------------------------------------------------------------------

export interface LinkTokenResult {
  proggaaUserId: string;
  role: ProggaaRole;
}

/**
 * Bridges a Telegram numeric user id to a Proggaa account.
 *
 * The real implementation will live on the Proggaa website: it generates
 * a short-lived one-time token in the user's account settings, the user
 * sends that token to the bot, and this service verifies it and returns
 * which Proggaa account/role it belongs to. The bot never sees or asks
 * for a Proggaa password.
 */
export interface TelegramLinkService {
  /** Returns the linked Proggaa account for a Telegram id, or null if unlinked. */
  getLinkedAccount(telegramId: string): Promise<LinkTokenResult | null>;
  /** Verifies a one-time token and links it to the given Telegram id. */
  linkWithToken(telegramId: string, token: string): Promise<LinkTokenResult>;
  /** Removes the link for a Telegram id. */
  unlink(telegramId: string): Promise<void>;
  /** Reverse lookup used by outbound push (e.g. notifications) — Proggaa user id -> Telegram id, or null if not linked to any Telegram account. */
  getTelegramIdForProggaaUser(proggaaUserId: string): Promise<string | null>;
}
