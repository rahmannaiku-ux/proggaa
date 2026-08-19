import type { MiddlewareFn } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import { logger } from "../../utils/logger";

export const requestLoggerMiddleware: MiddlewareFn<ProggaaBotContext> = async (ctx, next) => {
  const kind = ctx.updateType;
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : undefined;
  const callbackData = ctx.callbackQuery && "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;

  logger.debug("update.received", {
    kind,
    telegramId: ctx.from?.id,
    text: text?.split(" ")[0], // log the command only, not full free-text content
    callbackData,
  });

  await next();
};
