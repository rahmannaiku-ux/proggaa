import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { resultCardKeyboard } from "../keyboards/cards";
import { formatResultCard } from "../messages/formatters";
import { ICON, heading } from "../messages/brand";

const MAX_CARDS = 8;

export function registerResultsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("results", async (ctx) => {
    await sendResults(ctx, services);
  });

  bot.action("menu:results", async (ctx) => {
    await ctx.answerCbQuery();
    await sendResults(ctx, services);
  });
}

async function sendResults(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["STUDENT"])) return;

  const results = await services.resultService.getResultsForStudent(ctx.auth.proggaaUserId!);
  if (results.length === 0) {
    await ctx.reply(`${heading(ICON.result, "Your results")}\n\nNothing yet. Finish an Encounter and your result shows up here.`, {
      parse_mode: "Markdown",
      ...backToMenuKeyboard(),
    });
    return;
  }

  await ctx.reply(heading(ICON.result, "Your results"), { parse_mode: "Markdown" });
  for (const result of results.slice(0, MAX_CARDS)) {
    await ctx.reply(formatResultCard(result), {
      parse_mode: "Markdown",
      ...resultCardKeyboard(result, services.deepLinkService),
    });
  }
  await ctx.reply("Open a result on Proggaa for the full breakdown.", backToMenuKeyboard());
}
