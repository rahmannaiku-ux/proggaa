import type { MiddlewareFn } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import { ProggaaServiceError } from "../../services/proggaa/errors";
import { logger } from "../../utils/logger";

const FRIENDLY_FALLBACK =
  "😕 Something went wrong on our end. Please try again in a moment, or use /support if it keeps happening.";

/**
 * Wraps every update so a thrown error becomes a friendly Telegram message
 * instead of an unhandled crash or a raw stack trace shown to the user.
 * Known `ProggaaServiceError` subclasses (from mock or future real
 * services) are shown with their own message; everything else falls back
 * to a generic apology while the real error is logged.
 */
export const errorHandlerMiddleware: MiddlewareFn<ProggaaBotContext> = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof ProggaaServiceError) {
      logger.warn("handled_service_error", { code: error.code, message: error.message });
      await safeReply(ctx, `⚠️ ${error.message}`);
      return;
    }

    logger.error("unhandled_error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    await safeReply(ctx, FRIENDLY_FALLBACK);
  }
};

async function safeReply(ctx: ProggaaBotContext, text: string) {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    await ctx.reply(text);
  } catch {
    // If even the error reply fails (e.g. blocked bot), there's nothing more we can do.
  }
}
