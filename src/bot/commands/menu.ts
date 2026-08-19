import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { sendStartScreen } from "./start";

/** The "⬅️ Back to Menu" button used throughout the bot. */
export function registerMenuHomeAction(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.action("menu:home", async (ctx) => {
    await ctx.answerCbQuery();
    await sendStartScreen(ctx, services);
  });
}
