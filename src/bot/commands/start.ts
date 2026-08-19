import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { startKeyboard } from "../keyboards/mainMenu";
import { WELCOME_LINKED, WELCOME_UNLINKED } from "../messages/copy";

export function registerStartCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("start", async (ctx) => {
    await sendStartScreen(ctx, services);
  });
}

export async function sendStartScreen(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (ctx.auth.linked && ctx.auth.proggaaUserId) {
    const user = await services.userService.getUserById(ctx.auth.proggaaUserId);
    await ctx.reply(WELCOME_LINKED(user?.name ?? "there"), {
      parse_mode: "Markdown",
      ...startKeyboard(true),
    });
    return;
  }

  await ctx.reply(WELCOME_UNLINKED, {
    parse_mode: "Markdown",
    ...startKeyboard(false),
  });
}
