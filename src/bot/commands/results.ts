import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { formatResultCard } from "../messages/formatters";
import { resultCardKeyboard } from "../keyboards/cards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";

export function registerResultsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("results", async (ctx) => {
    await sendResults(ctx, services);
  });

  bot.action("menu:results", async (ctx) => {
    await ctx.answerCbQuery();
    await sendResults(ctx, services);
  });
}

export async function sendResults(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  if (ctx.auth.role !== "STUDENT") {
    await ctx.reply(
      "📊 Results here are shown from a student's perspective. Teachers can review submissions under /teacher → Grading.",
      backToMenuKeyboard()
    );
    return;
  }

  const results = await services.resultService.getResultsForStudent(ctx.auth.proggaaUserId!);

  if (results.length === 0) {
    await ctx.reply("📊 No published results yet.", backToMenuKeyboard());
    return;
  }

  await ctx.reply(`📊 *Results* (${results.length})`, { parse_mode: "Markdown" });
  for (const result of results) {
    await ctx.reply(formatResultCard(result), {
      parse_mode: "Markdown",
      ...resultCardKeyboard(result, services.deepLinkService),
    });
  }
  await ctx.reply("⬅️", backToMenuKeyboard());
}
