import type {
  Achievement,
  AdminStatistics,
  Course,
  ExamResult,
  ExamSummary,
  LiveExamStatus,
  Payment,
  ProggaaUser,
} from "../../../types/domain";

/**
 * Single shared in-memory "database" used by every Mock*Service.
 * This purely demonstrates the bot UX end-to-end. It is NOT meant to be
 * production persistence — swap the Mock*Service classes for Api*Service
 * classes (see services/container.ts) when the real Proggaa API exists.
 */

export const mockUsers: ProggaaUser[] = [
  {
    id: "user_student_1",
    name: "Ayesha Rahman",
    email: "ayesha@example.com",
    role: "STUDENT",
    xp: 3200,
    streakDays: 12,
  },
  {
    id: "user_teacher_1",
    name: "Mr. Kabir Hossain",
    email: "kabir@example.com",
    role: "TEACHER",
    xp: 0,
    streakDays: 0,
  },
  {
    id: "user_admin_1",
    name: "Nabila Islam",
    email: "nabila@example.com",
    role: "ADMIN",
    xp: 0,
    streakDays: 0,
  },
];

export const mockCourses: Course[] = [
  {
    id: "course_physics",
    name: "Physics",
    progressPercent: 68,
    nextLessonTitle: "Chapter 5 — Electricity",
    upcomingExamId: "exam_physics_midterm",
    upcomingExamTitle: "Chapter 5 Test",
  },
  {
    id: "course_chemistry",
    name: "Chemistry",
    progressPercent: 41,
    nextLessonTitle: "Chapter 3 — Chemical Bonding",
    upcomingExamId: "exam_chem_quiz",
    upcomingExamTitle: "Bonding Quiz",
  },
];

export const mockExams: ExamSummary[] = [
  {
    id: "exam_physics_midterm",
    courseId: "course_physics",
    courseName: "Physics",
    title: "Physics Midterm",
    status: "STARTING_SOON",
    startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 45,
  },
  {
    id: "exam_chem_quiz",
    courseId: "course_chemistry",
    courseName: "Chemistry",
    title: "Bonding Quiz",
    status: "SCHEDULED",
    startsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 20,
  },
  {
    id: "exam_physics_ch4",
    courseId: "course_physics",
    courseName: "Physics",
    title: "Chapter 4 Test",
    status: "COMPLETED",
    startsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 30,
  },
];

export const mockResults: ExamResult[] = [
  {
    id: "result_1",
    examId: "exam_physics_ch4",
    examTitle: "Chapter 4 Test",
    userId: "user_student_1",
    score: 42,
    maxScore: 50,
    percentage: 84,
    grade: "A",
    publishedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockAchievements: Achievement[] = [
  {
    id: "ach_1",
    userId: "user_student_1",
    name: "Perfect Score",
    description: "Score 100% on any exam.",
    xpAwarded: 100,
    unlockedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "ach_2",
    userId: "user_student_1",
    name: "7-Day Streak",
    description: "Study 7 days in a row.",
    xpAwarded: 50,
    unlockedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockPayments: Payment[] = [
  {
    id: "pay_1",
    studentId: "user_student_1",
    studentName: "Ayesha Rahman",
    courseId: "course_physics",
    courseName: "HSC Physics",
    amount: 500,
    currency: "BDT",
    transactionId: "ABC123",
    status: "PENDING",
    createdAt: new Date().toISOString(),
  },
];

export const mockLiveExams: LiveExamStatus[] = [
  {
    examId: "exam_physics_midterm",
    examTitle: "Physics Midterm",
    totalStudents: 82,
    activeStudents: 11,
    submittedStudents: 71,
    suspiciousEvents: 3,
  },
];

export const mockAdminStats: AdminStatistics = {
  studentCount: 1248,
  teacherCount: 82,
  courseCount: 126,
  examCount: 342,
  liveExamCount: 1,
  todaysPaymentsTotal: 48500,
  currency: "BDT",
};
