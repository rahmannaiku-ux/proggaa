import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { progressBar, formatDateTime } from "../messages/formatters";

export function registerProgressCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("progress", async (ctx) => {
    await sendProgress(ctx, services);
  });

  bot.action("menu:progress", async (ctx) => {
    await ctx.answerCbQuery();
    await sendProgress(ctx, services);
  });
}

async function sendProgress(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const proggaaUserId = ctx.auth.proggaaUserId!;
  const [user, courses, achievements] = await Promise.all([
    services.userService.getUserById(proggaaUserId),
    services.courseService.getCoursesForStudent(proggaaUserId),
    services.achievementService.getAchievementsForUser(proggaaUserId),
  ]);

  if (!user) {
    await ctx.reply("We couldn't find your Proggaa profile. Please try /link again.");
    return;
  }

  const lines = [
    `🏆 *My Progress*`,
    "",
    `⭐ XP: ${user.xp.toLocaleString()}`,
    `🔥 Streak: ${user.streakDays} day${user.streakDays === 1 ? "" : "s"}`,
    `🎖️ Achievements unlocked: ${achievements.length}`,
    "",
    "*Course completion:*",
  ];

  if (courses.length === 0) {
    lines.push("No active courses yet.");
  } else {
    for (const course of courses) {
      lines.push(`${course.name} — ${course.progressPercent}%  ${progressBar(course.progressPercent, 8)}`);
    }
  }

  if (achievements.length > 0) {
    lines.push("", "*Recent achievements:*");
    for (const a of [...achievements].sort((x, y) => y.unlockedAt.localeCompare(x.unlockedAt)).slice(0, 5)) {
      lines.push(`🏅 ${a.name} (+${a.xpAwarded} XP) — ${formatDateTime(a.unlockedAt)}`);
    }
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🏆 All Achievements", "menu:achievements")],
      [Markup.button.callback("📊 My Analysis", "menu:analysis")],
      [Markup.button.callback("⬅️ Back to Menu", "menu:home")],
    ]),
  });
}
