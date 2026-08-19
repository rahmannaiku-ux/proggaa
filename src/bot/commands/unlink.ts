import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { confirmKeyboard, backToMenuKeyboard } from "../keyboards/mainMenu";
import { UNLINK_CONFIRM, UNLINK_NOT_LINKED, UNLINK_SUCCESS } from "../messages/copy";
import { logger } from "../../utils/logger";

export function registerUnlinkCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("unlink", async (ctx) => {
    if (!ctx.auth.linked) {
      await ctx.reply(UNLINK_NOT_LINKED);
      return;
    }
    await ctx.reply(UNLINK_CONFIRM, confirmKeyboard("unlink:confirm", "unlink:cancel"));
  });

  bot.action("unlink:confirm", async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.auth.linked) {
      await ctx.editMessageText(UNLINK_NOT_LINKED);
      return;
    }
    await services.linkService.unlink(ctx.auth.telegramId);
    logger.audit("unlink.confirmed", { telegramId: ctx.auth.telegramId });
    await ctx.editMessageText(UNLINK_SUCCESS);
  });

  bot.action("unlink:cancel", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    await ctx.editMessageText("Cancelled — your account is still connected.", backToMenuKeyboard());
  });
}
