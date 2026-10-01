import type { MiddlewareFn } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import { logger } from "../../utils/logger";

interface Bucket {
  count: number;
  windowStartedAt: number;
}

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

/** Everything a person can do, per Telegram id. */
export const GENERAL_LIMIT: RateLimitRule = { windowMs: 10_000, max: 15 };
/** Trying link codes: the website limits this too, the bot just stops the noise early. */
export const LINK_ATTEMPT_LIMIT: RateLimitRule = { windowMs: 10 * 60_000, max: 6 };

/** A fixed-window counter per key. Old windows are dropped so memory cannot grow without bound. */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly rule: RateLimitRule, private readonly now: () => number = Date.now) {}

  /** Counts one hit and returns true if it is allowed. */
  hit(key: string): boolean {
    const now = this.now();
    this.prune(now);

    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartedAt >= this.rule.windowMs) {
      this.buckets.set(key, { count: 1, windowStartedAt: now });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.rule.max;
  }

  private prune(now: number) {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartedAt >= this.rule.windowMs) this.buckets.delete(key);
    }
  }
}

const general = new RateLimiter(GENERAL_LIMIT);
export const linkAttempts = new RateLimiter(LINK_ATTEMPT_LIMIT);

export const rateLimitMiddleware: MiddlewareFn<ProggaaBotContext> = async (ctx, next) => {
  const key = ctx.from?.id?.toString();
  if (!key) return next();

  if (general.hit(key)) return next();

  logger.warn("rate_limit.exceeded", { telegramId: key });
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery("You're going a bit fast. Please slow down.", { show_alert: false });
  } else {
    await ctx.reply("⏳ You're sending messages too quickly. Please wait a moment and try again.");
  }
};
