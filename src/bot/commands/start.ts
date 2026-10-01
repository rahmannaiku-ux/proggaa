import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { backToMenuKeyboard, moreKeyboard, startKeyboard } from "../keyboards/mainMenu";
import { clearWizard } from "../handlers/wizard";
import { show } from "../screens";
import { HELP_TEXT, WELCOME_LINKED, WELCOME_UNLINKED } from "../messages/copy";

export function registerStartCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("start", async (ctx) => {
    clearWizard(ctx);
    ctx.session.awaitingLinkToken = false;
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
    clearWizard(ctx);
    await sendStartScreen(ctx, services);
  });

  bot.action("menu:more", async (ctx) => {
    await ctx.answerCbQuery();
    await show(ctx, "➕ *More*", { parse_mode: "Markdown", ...moreKeyboard() });
  });
}

export async function sendStartScreen(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (ctx.auth.linked && ctx.auth.proggaaUserId) {
    const user = await services.userService.getUserById(ctx.auth.proggaaUserId);
    await show(ctx, WELCOME_LINKED(user?.name ?? "there"), {
      parse_mode: "Markdown",
      ...startKeyboard(true, ctx.auth.role),
    });
    return;
  }

  await show(ctx, WELCOME_UNLINKED, { parse_mode: "Markdown", ...startKeyboard(false) });
}

async function sendHelp(ctx: ProggaaBotContext) {
  await ctx.reply(HELP_TEXT(ctx.auth.linked && ctx.auth.role ? ctx.auth.role : "NONE"), {
    parse_mode: "Markdown",
    ...backToMenuKeyboard(),
  });
}
