import type { MiddlewareFn } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import { logger } from "../../utils/logger";

interface Bucket {
  count: number;
  windowStartedAt: number;
}

const WINDOW_MS = 10_000; // 10 seconds
const MAX_REQUESTS_PER_WINDOW = 15;

const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory sliding-window rate limiter, keyed by Telegram user id.
 * Good enough for a single-process bot; swap for a shared store (Redis)
 * if the bot is ever horizontally scaled.
 */
export const rateLimitMiddleware: MiddlewareFn<ProggaaBotContext> = async (ctx, next) => {
  const key = ctx.from?.id?.toString();
  if (!key) return next();

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStartedAt > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    return next();
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    logger.warn("rate_limit.exceeded", { telegramId: key });
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery("You're going a bit fast — please slow down.", { show_alert: false });
    } else {
      await ctx.reply("⏳ You're sending messages too quickly. Please wait a moment and try again.");
    }
    return;
  }

  return next();
};
