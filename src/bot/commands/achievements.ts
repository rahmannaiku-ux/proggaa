import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { formatAchievementCard } from "../messages/formatters";
import { ICON, heading, plural } from "../messages/brand";

export function registerAchievementsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("achievements", async (ctx) => {
    await sendAchievements(ctx, services);
  });

  bot.action("menu:achievements", async (ctx) => {
    await ctx.answerCbQuery();
    await sendAchievements(ctx, services);
  });
}

async function sendAchievements(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const achievements = await services.achievementService.getAchievementsForUser(ctx.auth.proggaaUserId!);
  if (achievements.length === 0) {
    await ctx.reply(`${heading(ICON.achievement, "Achievements")}\n\nNone yet. Complete a Patrol to unlock your first.`, {
      parse_mode: "Markdown",
      ...backToMenuKeyboard(),
    });
    return;
  }

  const body = achievements.slice(0, 15).map(formatAchievementCard).join("\n\n");
  await ctx.reply(`${heading(ICON.achievement, `Achievements (${plural(achievements.length, "unlocked", "unlocked")})`)}\n\n${body}`, {
    parse_mode: "Markdown",
    ...backToMenuKeyboard(),
  });
}
