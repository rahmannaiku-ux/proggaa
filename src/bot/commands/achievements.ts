import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { formatAchievementCard } from "../messages/formatters";
import { backToMenuKeyboard } from "../keyboards/mainMenu";

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
    await ctx.reply("🏆 No achievements unlocked yet — keep going!", backToMenuKeyboard());
    return;
  }

  const body = achievements.map(formatAchievementCard).join("\n\n");
  await ctx.reply(`🏆 *Achievements* (${achievements.length})\n\n${body}`, {
    parse_mode: "Markdown",
    ...backToMenuKeyboard(),
  });
}
