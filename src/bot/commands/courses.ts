import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { formatCourseCard } from "../messages/formatters";
import { courseCardKeyboard } from "../keyboards/cards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";

export function registerCoursesCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("courses", async (ctx) => {
    await sendCourses(ctx, services);
  });

  bot.action("menu:courses", async (ctx) => {
    await ctx.answerCbQuery();
    await sendCourses(ctx, services);
  });
}

export async function sendCourses(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const proggaaUserId = ctx.auth.proggaaUserId!;
  const courses =
    ctx.auth.role === "TEACHER"
      ? await services.courseService.getCoursesForTeacher(proggaaUserId)
      : await services.courseService.getCoursesForStudent(proggaaUserId);

  if (courses.length === 0) {
    await ctx.reply("📚 You don't have any courses yet.", backToMenuKeyboard());
    return;
  }

  await ctx.reply(`📚 *My Courses* (${courses.length})`, { parse_mode: "Markdown" });
  for (const course of courses) {
    await ctx.reply(formatCourseCard(course), {
      parse_mode: "Markdown",
      ...courseCardKeyboard(course, services.deepLinkService),
    });
  }
  await ctx.reply("⬅️", backToMenuKeyboard());
}
