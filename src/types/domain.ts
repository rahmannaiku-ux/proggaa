/**
 * Core Proggaa domain types.
 *
 * These types describe the LMS domain (users, courses, exams, payments, ...)
 * and are intentionally decoupled from Telegram. Nothing in this file should
 * import from `telegraf` or any bot-specific module. This is what makes it
 * safe to eventually swap Telegram for another channel, or to reuse these
 * types directly against a real Proggaa API client.
 */

export type ProggaaRole = "STUDENT" | "TEACHER" | "ADMIN";

export interface ProggaaUser {
  id: string; // Proggaa user id (NOT the Telegram id)
  name: string;
  email?: string;
  role: ProggaaRole;
  xp: number;
  streakDays: number;
  avatarUrl?: string;
}

export interface Course {
  id: string;
  name: string;
  progressPercent: number; // 0-100, for the requesting student
  nextLessonTitle?: string;
  upcomingExamId?: string;
  upcomingExamTitle?: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: string; // ISO date
}

export type ExamStatus =
  | "SCHEDULED"
  | "STARTING_SOON"
  | "LIVE"
  | "ENDING_SOON"
  | "COMPLETED"
  | "CANCELLED";

export interface ExamSummary {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  status: ExamStatus;
  startsAt: string; // ISO date
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
  publishedAt: string; // ISO date
}

export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  amount: number;
  currency: string; // e.g. "BDT"
  transactionId: string;
  status: PaymentStatus;
  createdAt: string; // ISO date
}

export interface Achievement {
  id: string;
  userId: string;
  name: string;
  description: string;
  xpAwarded: number;
  unlockedAt: string; // ISO date
}

export type NotificationCategory =
  | "EXAM_REMINDERS"
  | "RESULTS"
  | "COURSE_UPDATES"
  | "ASSIGNMENTS"
  | "ACHIEVEMENTS"
  | "PAYMENTS"
  | "SUPPORT_UPDATES"
  | "TEACHER_ALERTS"
  | "SYSTEM_ALERTS";

export interface NotificationPreferences {
  userId: string;
  categories: Record<NotificationCategory, boolean>;
}

export type NotificationEventType =
  | "EXAM_SCHEDULED"
  | "EXAM_REMINDER_1_DAY"
  | "EXAM_REMINDER_1_HOUR"
  | "EXAM_REMINDER_10_MIN"
  | "EXAM_STARTED"
  | "EXAM_ENDING_SOON"
  | "EXAM_SUBMITTED"
  | "RESULTS_PUBLISHED"
  | "MANUAL_GRADING_COMPLETED"
  | "EXAM_CANCELLED"
  | "EXAM_RESCHEDULED"
  | "RETAKE_AVAILABLE"
  | "TEACHER_STUDENT_SUBMITTED"
  | "TEACHER_MANUAL_GRADING_REQUIRED"
  | "TEACHER_SUSPICIOUS_ACTIVITY"
  | "TEACHER_STUDENT_DISQUALIFIED"
  | "TEACHER_EXAM_COMPLETED"
  | "TEACHER_LIVE_EXAM_STARTED"
  | "TEACHER_LIVE_EXAM_ENDED"
  | "ACHIEVEMENT_UNLOCKED"
  | "PAYMENT_NEW"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "ENROLLMENT_COMPLETED"
  | "SUPPORT_TICKET_REPLIED";

export interface NotificationEvent {
  type: NotificationEventType;
  userId: string; // recipient Proggaa user id
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, string>; // ids used to build deep links, etc.
}

export type SupportCategory =
  | "PAYMENT_PROBLEM"
  | "COURSE_ACCESS"
  | "VIDEO_PROBLEM"
  | "EXAM_PROBLEM"
  | "RESULT_PROBLEM"
  | "ACCOUNT_PROBLEM"
  | "CERTIFICATE_PROBLEM"
  | "REFUND_PROBLEM"
  | "BUG_REPORT"
  | "OTHER";

export type SupportTicketStatus =
  | "WAITING" // waiting for support to pick it up
  | "IN_PROGRESS" // a teacher/admin is actively working it
  | "RESOLVED"
  | "ESCALATED"
  | "CLOSED";

export type SupportTicketPriority = "NORMAL" | "HIGH";

/**
 * Diagnostic context auto-attached to a ticket when it's available, so
 * staff don't have to ask the student for basic info. Every field is
 * optional — only attach what's actually known for that category.
 * Never rendered in group chats; this is support-thread-only.
 */
export interface SupportTicketContext {
  courseId?: string;
  courseName?: string;
  lessonId?: string;
  examId?: string;
  examTitle?: string;
  attemptId?: string;
  paymentId?: string;
  transactionId?: string;
  errorInfo?: string;
}

export interface SupportTicketMessage {
  id: string;
  author: "STUDENT" | "STAFF";
  authorName: string;
  body: string;
  createdAt: string; // ISO date
}

export interface SupportTicket {
  id: string; // internal id, e.g. "ticket_42"
  ticketNumber: string; // human-facing id, e.g. "PRG-000042"
  userId: string;
  category: SupportCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  context?: SupportTicketContext;
  messages: SupportTicketMessage[]; // messages[0] is always the opening message
  assignedToUserId?: string;
  assignedToName?: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

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
  todaysPaymentsTotal: number;
  currency: string;
}

export type QuestionType = "MCQ" | "NUMERICAL" | "SHORT_ANSWER";
export type QuestionDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  topic: string;
  prompt: string;
  choices?: string[]; // for MCQ
  correctAnswer?: string;
}

export interface AIGenerationRequest {
  topic: string;
  questionType: QuestionType;
  difficulty: QuestionDifficulty;
  count: number;
  sourceText?: string;
}

export interface AIGenerationResult {
  requestId: string;
  questions: Question[];
}

// Student-facing AI tutoring (distinct from teacher/admin question
// generation above) — explaining concepts, summaries, hints, flashcards,
// revision plans. Never used to solve/reveal active exam questions; the
// bot enforces that lockout before calling this, not the AI itself.
export type TutorMode = "EXPLAIN_TOPIC" | "SUMMARIZE_LESSON" | "HINT" | "FLASHCARDS" | "REVISION_SESSION";

export interface TutorRequest {
  mode: TutorMode;
  topic: string;
  /** Student's enrolled course names, if available — used only to ground
   * lesson summaries against the right course, never sent as full records. */
  enrolledCourses?: string[];
}

export interface TeacherAnalytics {
  totalStudents: number;
  avgCourseProgress: number; // 0-100
  avgExamScore: number; // 0-100 (percentage)
  completionRate: number; // 0-100, % of enrolled students who finish a course
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface SystemAlert {
  severity: AlertSeverity;
  message: string;
}

// ---------------------------------------------------------------------------
// Group Assistant
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
  createdAt: string; // ISO date
}

