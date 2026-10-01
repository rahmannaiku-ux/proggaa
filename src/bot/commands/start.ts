import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { backToMenuKeyboard, startKeyboard } from "../keyboards/mainMenu";
import { HELP_TEXT, WELCOME_LINKED, WELCOME_UNLINKED } from "../messages/copy";

export function registerStartCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("start", async (ctx) => {
    await sendStartScreen(ctx, services);
  });

  bot.command("help", async (ctx) => {
    await sendHelp(ctx);
  });

  bot.action("menu:help", async (ctx) => {
    await ctx.answerCbQuery();
    await sendHelp(ctx);
  });

  // The "Menu" button used throughout the bot.
  bot.action("menu:home", async (ctx) => {
    await ctx.answerCbQuery();
    await sendStartScreen(ctx, services);
  });
}

export async function sendStartScreen(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (ctx.auth.linked && ctx.auth.proggaaUserId) {
    const user = await services.userService.getUserById(ctx.auth.proggaaUserId);
    await ctx.reply(WELCOME_LINKED(user?.name ?? "there"), {
      parse_mode: "Markdown",
      ...startKeyboard(true, ctx.auth.role),
    });
    return;
  }

  await ctx.reply(WELCOME_UNLINKED, { parse_mode: "Markdown", ...startKeyboard(false) });
}

async function sendHelp(ctx: ProggaaBotContext) {
  await ctx.reply(HELP_TEXT(ctx.auth.linked && ctx.auth.role ? ctx.auth.role : "NONE"), {
    parse_mode: "Markdown",
    ...backToMenuKeyboard(),
  });
}
