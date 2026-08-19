import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { studentDashboardKeyboard } from "../keyboards/mainMenu";
import { progressBar } from "../messages/formatters";
import { sendTeacherDashboard } from "./teacher";
import { sendAdminDashboard } from "./admin";

export function registerDashboardCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("dashboard", async (ctx) => {
    await sendDashboard(ctx, services);
  });

  bot.action("menu:dashboard", async (ctx) => {
    await ctx.answerCbQuery();
    await sendDashboard(ctx, services);
  });
}

/** Routes to the correct dashboard for the caller's current role. */
export async function sendDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  if (ctx.auth.role === "TEACHER") return sendTeacherDashboard(ctx, services);
  if (ctx.auth.role === "ADMIN") return sendAdminDashboard(ctx, services);

  await sendStudentDashboard(ctx, services);
}

async function sendStudentDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  const proggaaUserId = ctx.auth.proggaaUserId!;

  const [user, courses, exams, achievements] = await Promise.all([
    services.userService.getUserById(proggaaUserId),
    services.courseService.getCoursesForStudent(proggaaUserId),
    services.examService.getExamsForStudent(proggaaUserId),
    services.achievementService.getAchievementsForUser(proggaaUserId),
  ]);

  if (!user) {
    await ctx.reply("We couldn't find your Proggaa profile. Please try /link again.");
    return;
  }

  const upcomingExamCount = exams.filter(
    (e) => e.status === "SCHEDULED" || e.status === "STARTING_SOON" || e.status === "LIVE"
  ).length;
  const avgProgress = courses.length
    ? Math.round(courses.reduce((sum, c) => sum + c.progressPercent, 0) / courses.length)
    : 0;

  const lines = [
    `👤 *${user.name}*`,
    "",
    `📚 Active courses: ${courses.length}`,
    `📝 Upcoming exams: ${upcomingExamCount}`,
    `📈 Progress: ${avgProgress}%  ${progressBar(avgProgress, 8)}`,
    `🔥 Streak: ${user.streakDays} day${user.streakDays === 1 ? "" : "s"}`,
    `⭐ XP: ${user.xp.toLocaleString()}`,
    `🏆 Achievements: ${achievements.length}`,
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...studentDashboardKeyboard() });
}
