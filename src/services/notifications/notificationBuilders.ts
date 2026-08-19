import type { NotificationEvent } from "../../types/domain";

/**
 * Pure builder functions for every notification event described in the
 * spec. These do NOT send anything — they just build a well-formed
 * `NotificationEvent`. Something else (a future scheduler, webhook
 * receiver, or the real Proggaa backend) calls these and passes the
 * result to `ProggaaNotificationService.dispatch()`, which is what
 * actually delivers it (and, eventually, checks
 * `NotificationPreferenceService` before sending).
 *
 * Keeping these as small pure functions means they're trivial to unit
 * test and trivial to reuse from a cron job, a webhook handler, or a
 * manual "resend" admin action later.
 */

export function examScheduled(userId: string, examTitle: string, examId: string, startsAt: string): NotificationEvent {
  return {
    type: "EXAM_SCHEDULED",
    userId,
    category: "EXAM_REMINDERS",
    title: "🗓️ Exam Scheduled",
    body: `${examTitle} has been scheduled for ${startsAt}.`,
    data: { examId },
  };
}

export function examReminder1Day(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "EXAM_REMINDER_1_DAY",
    userId,
    category: "EXAM_REMINDERS",
    title: "⏰ Exam Tomorrow",
    body: `${examTitle} starts in about 24 hours. Get ready!`,
    data: { examId },
  };
}

export function examReminder1Hour(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "EXAM_REMINDER_1_HOUR",
    userId,
    category: "EXAM_REMINDERS",
    title: "⏰ Exam in 1 Hour",
    body: `${examTitle} starts in 1 hour.`,
    data: { examId },
  };
}

export function examReminder10Min(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "EXAM_REMINDER_10_MIN",
    userId,
    category: "EXAM_REMINDERS",
    title: "⏰ Exam Starting Soon",
    body: `${examTitle} starts in 10 minutes. Get into position!`,
    data: { examId },
  };
}

export function examStarted(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "EXAM_STARTED",
    userId,
    category: "EXAM_REMINDERS",
    title: "🟢 Exam Started",
    body: `${examTitle} has started.`,
    data: { examId },
  };
}

export function examEndingSoon(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "EXAM_ENDING_SOON",
    userId,
    category: "EXAM_REMINDERS",
    title: "🟠 Exam Ending Soon",
    body: `${examTitle} is ending soon — submit your answers now.`,
    data: { examId },
  };
}

export function examSubmitted(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "EXAM_SUBMITTED",
    userId,
    category: "EXAM_REMINDERS",
    title: "✅ Exam Submitted",
    body: `Your answers for ${examTitle} were submitted successfully.`,
    data: { examId },
  };
}

export function resultsPublished(userId: string, examTitle: string, resultId: string): NotificationEvent {
  return {
    type: "RESULTS_PUBLISHED",
    userId,
    category: "RESULTS",
    title: "📊 Results Published",
    body: `Your results for ${examTitle} are ready.`,
    data: { resultId },
  };
}

export function manualGradingCompleted(userId: string, examTitle: string, resultId: string): NotificationEvent {
  return {
    type: "MANUAL_GRADING_COMPLETED",
    userId,
    category: "RESULTS",
    title: "📝 Grading Completed",
    body: `Manual grading for ${examTitle} is complete — your final score is ready.`,
    data: { resultId },
  };
}

export function examCancelled(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "EXAM_CANCELLED",
    userId,
    category: "EXAM_REMINDERS",
    title: "🚫 Exam Cancelled",
    body: `${examTitle} has been cancelled.`,
    data: { examId },
  };
}

export function examRescheduled(userId: string, examTitle: string, examId: string, newStartsAt: string): NotificationEvent {
  return {
    type: "EXAM_RESCHEDULED",
    userId,
    category: "EXAM_REMINDERS",
    title: "🔄 Exam Rescheduled",
    body: `${examTitle} has been rescheduled to ${newStartsAt}.`,
    data: { examId },
  };
}

export function retakeAvailable(userId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "RETAKE_AVAILABLE",
    userId,
    category: "EXAM_REMINDERS",
    title: "🔁 Retake Available",
    body: `A retake for ${examTitle} is now available.`,
    data: { examId },
  };
}

export function teacherStudentSubmitted(teacherId: string, studentName: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "TEACHER_STUDENT_SUBMITTED",
    userId: teacherId,
    category: "TEACHER_ALERTS",
    title: "📥 Submission Received",
    body: `${studentName} submitted ${examTitle}.`,
    data: { examId },
  };
}

export function teacherManualGradingRequired(teacherId: string, examTitle: string, examId: string, count: number): NotificationEvent {
  return {
    type: "TEACHER_MANUAL_GRADING_REQUIRED",
    userId: teacherId,
    category: "TEACHER_ALERTS",
    title: "📝 Manual Grading Required",
    body: `${examTitle}: ${count} answer${count === 1 ? "" : "s"} require review.`,
    data: { examId },
  };
}

export function teacherSuspiciousActivity(teacherId: string, studentName: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "TEACHER_SUSPICIOUS_ACTIVITY",
    userId: teacherId,
    category: "TEACHER_ALERTS",
    title: "⚠️ Suspicious Activity",
    body: `Suspicious activity detected for ${studentName} during ${examTitle}.`,
    data: { examId },
  };
}

export function teacherStudentDisqualified(teacherId: string, studentName: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "TEACHER_STUDENT_DISQUALIFIED",
    userId: teacherId,
    category: "TEACHER_ALERTS",
    title: "🚫 Student Disqualified",
    body: `${studentName} was disqualified from ${examTitle}.`,
    data: { examId },
  };
}

export function teacherExamCompleted(teacherId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "TEACHER_EXAM_COMPLETED",
    userId: teacherId,
    category: "TEACHER_ALERTS",
    title: "✅ Exam Completed",
    body: `${examTitle} has finished for all students.`,
    data: { examId },
  };
}

export function teacherLiveExamStarted(teacherId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "TEACHER_LIVE_EXAM_STARTED",
    userId: teacherId,
    category: "TEACHER_ALERTS",
    title: "🔴 Live Exam Started",
    body: `${examTitle} is now live.`,
    data: { examId },
  };
}

export function teacherLiveExamEnded(teacherId: string, examTitle: string, examId: string): NotificationEvent {
  return {
    type: "TEACHER_LIVE_EXAM_ENDED",
    userId: teacherId,
    category: "TEACHER_ALERTS",
    title: "🏁 Live Exam Ended",
    body: `${examTitle} has ended.`,
    data: { examId },
  };
}

export function achievementUnlocked(userId: string, achievementName: string, xp: number): NotificationEvent {
  return {
    type: "ACHIEVEMENT_UNLOCKED",
    userId,
    category: "ACHIEVEMENTS",
    title: "🎉 Achievement Unlocked!",
    body: `🏆 ${achievementName}\n\nYou earned +${xp} XP.`,
  };
}

export function paymentNew(adminId: string, studentName: string, courseName: string, paymentId: string): NotificationEvent {
  return {
    type: "PAYMENT_NEW",
    userId: adminId,
    category: "PAYMENTS",
    title: "💰 New Payment",
    body: `${studentName} submitted a payment for ${courseName}.`,
    data: { paymentId },
  };
}

export function paymentApproved(userId: string, courseName: string, paymentId: string): NotificationEvent {
  return {
    type: "PAYMENT_APPROVED",
    userId,
    category: "PAYMENTS",
    title: "✅ Payment Approved",
    body: `Your payment for ${courseName} was approved.`,
    data: { paymentId },
  };
}

export function paymentRejected(userId: string, courseName: string, paymentId: string): NotificationEvent {
  return {
    type: "PAYMENT_REJECTED",
    userId,
    category: "PAYMENTS",
    title: "❌ Payment Rejected",
    body: `Your payment for ${courseName} was rejected. Contact support for help.`,
    data: { paymentId },
  };
}

export function enrollmentCompleted(userId: string, courseName: string): NotificationEvent {
  return {
    type: "ENROLLMENT_COMPLETED",
    userId,
    category: "COURSE_UPDATES",
    title: "🎓 Enrollment Complete",
    body: `You're enrolled in ${courseName}. Happy learning!`,
  };
}

export function supportTicketReplied(userId: string, ticketNumber: string, ticketId: string): NotificationEvent {
  return {
    type: "SUPPORT_TICKET_REPLIED",
    userId,
    category: "SUPPORT_UPDATES",
    title: "🎫 Support Reply",
    body: `You have a new reply on ticket ${ticketNumber}. Open Support → My Tickets to view it.`,
    data: { ticketId },
  };
}
