import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { liveClassKeyboard } from "../keyboards/cards";
import { formatLiveClassCard } from "../messages/formatters";
import { ICON, heading } from "../messages/brand";

export function registerLiveCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("live", async (ctx) => {
    await sendLiveClasses(ctx, services);
  });

  bot.action("menu:live", async (ctx) => {
    await ctx.answerCbQuery();
    await sendLiveClasses(ctx, services);
  });
}

async function sendLiveClasses(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const classes = await services.liveClassService.getLiveClasses(ctx.auth.proggaaUserId!);
  if (classes.length === 0) {
    await ctx.reply(`${heading(ICON.live, "Live classes")}\n\nNo live classes are scheduled in your Missions right now.`, {
      parse_mode: "Markdown",
      ...backToMenuKeyboard(),
    });
    return;
  }

  await ctx.reply(heading(ICON.live, "Live classes"), { parse_mode: "Markdown" });
  for (const liveClass of classes) {
    await ctx.reply(formatLiveClassCard(liveClass), {
      parse_mode: "Markdown",
      ...liveClassKeyboard(liveClass, services.deepLinkService),
    });
  }
  await ctx.reply("Times are in Bangladesh time (BST).", backToMenuKeyboard());
}
