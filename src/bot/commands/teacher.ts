import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { teacherDashboardKeyboard, backToMenuKeyboard, confirmKeyboard } from "../keyboards/mainMenu";
import { formatCourseCard, formatExamCard, formatLiveExamCard } from "../messages/formatters";
import { courseCardKeyboard, examCardKeyboard, liveExamCardKeyboard, gradingQueueKeyboard } from "../keyboards/cards";
import { startWizard, clearWizard } from "../handlers/wizard";
import { isValidEntityId, validateBoundedText, TEXT_LIMITS } from "../../utils/validation";
import { NotFoundError } from "../../services/proggaa/errors";
import { logger } from "../../utils/logger";

export function registerTeacherCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("teacher", async (ctx) => {
    await sendTeacherDashboard(ctx, services);
  });

  bot.action("teacher:courses", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;
    const courses = await services.courseService.getCoursesForTeacher(ctx.auth.proggaaUserId!);
    if (courses.length === 0) {
      await ctx.reply("📚 No courses assigned yet.", backToMenuKeyboard());
      return;
    }
    for (const course of courses) {
      await ctx.reply(formatCourseCard(course), {
        parse_mode: "Markdown",
        ...courseCardKeyboard(course, services.deepLinkService),
      });
    }
  });

  bot.action("teacher:exams", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;
    const exams = await services.examService.getExamsForTeacher(ctx.auth.proggaaUserId!);
    if (exams.length === 0) {
      await ctx.reply("📝 No exams yet.", backToMenuKeyboard());
      return;
    }
    for (const exam of exams) {
      await ctx.reply(formatExamCard(exam), {
        parse_mode: "Markdown",
        ...examCardKeyboard(exam, services.deepLinkService),
      });
    }
  });

  bot.action("teacher:live", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;
    const liveExams = await services.examService.getLiveExamsForTeacher(ctx.auth.proggaaUserId!);
    if (liveExams.length === 0) {
      await ctx.reply("🔴 No exams are live right now.", backToMenuKeyboard());
      return;
    }
    for (const status of liveExams) {
      await ctx.reply(formatLiveExamCard(status), {
        parse_mode: "Markdown",
        ...liveExamCardKeyboard(status, services.deepLinkService),
      });
    }
  });

  bot.action("teacher:grading", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;
    const exams = await services.examService.getExamsForTeacher(ctx.auth.proggaaUserId!);
    const completed = exams.filter((e) => e.status === "COMPLETED");

    if (completed.length === 0) {
      await ctx.reply("📝 Nothing pending grading right now.", backToMenuKeyboard());
      return;
    }

    for (const exam of completed) {
      const pendingCount = await services.resultService.getPendingManualGradingCount(exam.id);
      if (pendingCount === 0) continue;
      await ctx.reply(
        `📝 *Manual Grading Required*\n\n${exam.title}\n\n${pendingCount} answer${pendingCount === 1 ? "" : "s"} require review.`,
        { parse_mode: "Markdown", ...gradingQueueKeyboard(exam.id, services.deepLinkService) }
      );
    }
  });

  bot.action("teacher:analytics", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;

    const analytics = await services.courseService.getTeacherAnalytics(ctx.auth.proggaaUserId!);
    const lines = [
      "📊 *Teacher Analytics*",
      "",
      `👥 Total students: ${analytics.totalStudents}`,
      `📈 Avg. course progress: ${analytics.avgCourseProgress}%`,
      `📝 Avg. exam score: ${analytics.avgExamScore}%`,
      `✅ Completion rate: ${analytics.completionRate}%`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...backToMenuKeyboard() });
  });

  // Announcements: pick a course, write the message, then confirm before
  // sending — "announcement sending" is explicitly listed as a sensitive
  // action in the spec's security section, same tier as payment approval.
  bot.action("teacher:announcements", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;

    const courses = await services.courseService.getCoursesForTeacher(ctx.auth.proggaaUserId!);
    if (courses.length === 0) {
      await ctx.reply("📢 No courses to announce to yet.", backToMenuKeyboard());
      return;
    }

    const rows = courses.map((c) => [Markup.button.callback(c.name, `announce:course:${c.id}`)]);
    await ctx.reply("📢 Which course is this announcement for?", Markup.inlineKeyboard(rows));
  });

  bot.action(/^announce:course:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;

    const courseId = ctx.match[1];
    if (!isValidEntityId(courseId)) return ctx.reply("Invalid course reference.");

    const course = await services.courseService.getCourseById(courseId);
    if (!course) return ctx.reply("That course no longer exists.");

    startWizard(ctx, "announcement", "awaiting_message", { courseId, courseName: course.name });
    await ctx.reply(`✍️ Send the announcement message for *${course.name}*.`, { parse_mode: "Markdown" });
  });

  bot.action("announce:send:confirm", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER"])) return;

    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "announcement" || !wizard.data.message) {
      await ctx.reply("This announcement session expired. Please start again from /teacher.");
      return;
    }

    try {
      const { recipientCount } = await services.announcementService.sendAnnouncement(
        wizard.data.courseId,
        ctx.auth.proggaaUserId!,
        wizard.data.message
      );
      logger.audit("announcement.sent_via_bot", {
        telegramId: ctx.auth.telegramId,
        courseId: wizard.data.courseId,
        recipientCount,
      });
      await ctx.editMessageText(`✅ Announcement sent to ${recipientCount} student${recipientCount === 1 ? "" : "s"}.`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        await ctx.editMessageText("That course no longer exists.");
        return;
      }
      throw error;
    } finally {
      clearWizard(ctx);
    }
  });

  bot.action("announce:send:cancel", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    clearWizard(ctx);
    await ctx.editMessageText("Cancelled — nothing was sent.");
  });
}

/** Called by the central text router when an "announcement" wizard is awaiting the message body. */
export async function handleAnnouncementTextInput(ctx: ProggaaBotContext, _services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "announcement" || wizard.step !== "awaiting_message") return;

  const validated = validateBoundedText(text, TEXT_LIMITS.announcementMessage);
  if (!validated.ok) {
    await ctx.reply(`Announcement ${validated.error}. Please try again.`);
    return;
  }

  wizard.data.message = validated.value;
  wizard.step = "confirming";

  await ctx.reply(
    `📢 *Preview — ${wizard.data.courseName}*\n\n${validated.value}\n\nSend this announcement?`,
    { parse_mode: "Markdown", ...confirmKeyboard("announce:send:confirm", "announce:send:cancel") }
  );
}

export async function sendTeacherDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["TEACHER"])) return;

  const proggaaUserId = ctx.auth.proggaaUserId!;
  const [user, courses, exams, liveExams] = await Promise.all([
    services.userService.getUserById(proggaaUserId),
    services.courseService.getCoursesForTeacher(proggaaUserId),
    services.examService.getExamsForTeacher(proggaaUserId),
    services.examService.getLiveExamsForTeacher(proggaaUserId),
  ]);

  const activeExams = exams.filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED");
  const completedExams = exams.filter((e) => e.status === "COMPLETED");

  let pendingGrading = 0;
  for (const exam of completedExams) {
    pendingGrading += await services.resultService.getPendingManualGradingCount(exam.id);
  }

  const lines = [
    `👨‍🏫 *Teacher Dashboard*`,
    user ? `${user.name}` : "",
    "",
    `📚 Courses: ${courses.length}`,
    `📝 Active exams: ${activeExams.length}`,
    `🔴 Live exams: ${liveExams.length}`,
    `📝 Pending grading: ${pendingGrading}`,
  ].filter(Boolean);

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...teacherDashboardKeyboard() });
}
