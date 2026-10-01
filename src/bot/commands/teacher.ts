import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { MENTOR_ROLES, requireRole } from "../middleware/guards";
import { backToMenuKeyboard, teacherDashboardKeyboard } from "../keyboards/mainMenu";
import { encounterCardKeyboard, gradingKeyboard, liveExamKeyboard, mentorMissionKeyboard } from "../keyboards/cards";
import { formatEncounterCard, formatLiveExamCard, formatMissionCard } from "../messages/formatters";
import { ICON, TERMS, esc, heading, plural } from "../messages/brand";

const MAX_CARDS = 8;

export function registerTeacherCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("teacher", async (ctx) => {
    await sendTeacherDashboard(ctx, services);
  });

  bot.action("menu:teacher", async (ctx) => {
    await ctx.answerCbQuery();
    await sendTeacherDashboard(ctx, services);
  });

  bot.action("teacher:missions", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, MENTOR_ROLES)) return;
    const courses = await services.courseService.getCoursesForTeacher(ctx.auth.proggaaUserId!);
    if (courses.length === 0) {
      await ctx.reply(`${ICON.mission} You don't teach any ${TERMS.courses} yet.`, backToMenuKeyboard());
      return;
    }
    await ctx.reply(heading(ICON.mission, `Your ${TERMS.courses} (${courses.length})`), { parse_mode: "Markdown" });
    for (const course of courses.slice(0, MAX_CARDS)) {
      await ctx.reply(formatMissionCard(course), {
        parse_mode: "Markdown",
        ...mentorMissionKeyboard(course, services.deepLinkService),
      });
    }
  });

  bot.action("teacher:exams", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, MENTOR_ROLES)) return;
    const exams = await services.examService.getExamsForTeacher(ctx.auth.proggaaUserId!);
    if (exams.length === 0) {
      await ctx.reply(`${ICON.encounter} No ${TERMS.exams} yet.`, backToMenuKeyboard());
      return;
    }
    for (const exam of exams.slice(0, MAX_CARDS)) {
      await ctx.reply(formatEncounterCard(exam), {
        parse_mode: "Markdown",
        ...encounterCardKeyboard(exam, services.deepLinkService),
      });
    }
  });

  bot.action("teacher:live", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, MENTOR_ROLES)) return;
    const live = await services.examService.getLiveExamsForTeacher(ctx.auth.proggaaUserId!);
    if (live.length === 0) {
      await ctx.reply(`${ICON.live} No ${TERMS.exams} are live right now.`, backToMenuKeyboard());
      return;
    }
    for (const status of live) {
      await ctx.reply(formatLiveExamCard(status), {
        parse_mode: "Markdown",
        ...liveExamKeyboard(status, services.deepLinkService),
      });
    }
  });

  bot.action("teacher:grading", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, MENTOR_ROLES)) return;
    const id = ctx.auth.proggaaUserId!;
    const exams = (await services.examService.getExamsForTeacher(id)).filter((e) => e.status === "COMPLETED");

    let waiting = 0;
    for (const exam of exams.slice(0, 20)) {
      const count = await services.resultService.getPendingManualGradingCount(id, exam.id);
      if (count === 0) continue;
      waiting += count;
      await ctx.reply(`📝 *${esc(exam.title)}*\n${plural(count, "answer")} waiting for your review.`, {
        parse_mode: "Markdown",
        ...gradingKeyboard(services.deepLinkService),
      });
    }
    if (waiting === 0) await ctx.reply(`${ICON.done} Nothing is waiting to be graded.`, backToMenuKeyboard());
  });

  bot.action("teacher:analytics", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, MENTOR_ROLES)) return;

    const a = await services.courseService.getTeacherAnalytics(ctx.auth.proggaaUserId!);
    await ctx.reply(
      [
        heading("📊", "Analytics"),
        "",
        `${TERMS.student}s enrolled: ${a.totalStudents}`,
        `Average ${TERMS.course} progress: ${a.avgCourseProgress}%`,
        `Average ${TERMS.exam} score: ${a.avgExamScore}%`,
        `Completion rate: ${a.completionRate}%`,
      ].join("\n"),
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
  });
}

export async function sendTeacherDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, MENTOR_ROLES)) return;

  const id = ctx.auth.proggaaUserId!;
  const [user, courses, exams, liveExams] = await Promise.all([
    services.userService.getUserById(id),
    services.courseService.getCoursesForTeacher(id),
    services.examService.getExamsForTeacher(id),
    services.examService.getLiveExamsForTeacher(id),
  ]);

  const active = exams.filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED");
  const completed = exams.filter((e) => e.status === "COMPLETED").slice(0, 20);
  let pendingGrading = 0;
  for (const exam of completed) pendingGrading += await services.resultService.getPendingManualGradingCount(id, exam.id);

  await ctx.reply(
    [
      heading(ICON.mentor, `${TERMS.teacher} dashboard`),
      user ? esc(user.name) : "",
      "",
      `${ICON.mission} ${TERMS.courses}: ${courses.length}`,
      `${ICON.encounter} Active ${TERMS.exams}: ${active.length}`,
      `${ICON.live} Live now: ${liveExams.length}`,
      `📝 Waiting to be graded: ${pendingGrading}`,
    ]
      .filter((l) => l !== "")
      .join("\n"),
    { parse_mode: "Markdown", ...teacherDashboardKeyboard() }
  );
}
