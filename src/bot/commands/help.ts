import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import { HELP_TEXT } from "../messages/copy";
import { backToMenuKeyboard } from "../keyboards/mainMenu";

export function registerHelpCommand(bot: Telegraf<ProggaaBotContext>) {
  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown", ...backToMenuKeyboard() });
  });

  bot.action("menu:help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown", ...backToMenuKeyboard() });
  });
}
