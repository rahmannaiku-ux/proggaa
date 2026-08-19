import type { MiddlewareFn } from "telegraf";
import type { BotSession, ProggaaBotContext } from "../../types/session";

/**
 * Minimal in-memory session store, keyed by chat id.
 *
 * This only holds short-lived conversational state (e.g. "waiting for a
 * link token"). It is intentionally NOT where identity/role lives — swap
 * for a Redis- or DB-backed store later without touching bot logic, since
 * everything reads/writes through `ctx.session`.
 */
const store = new Map<number, BotSession>();

export const sessionMiddleware: MiddlewareFn<ProggaaBotContext> = async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    ctx.session = {};
    return next();
  }
  const existing = store.get(chatId) ?? {};
  ctx.session = existing;
  await next();
  store.set(chatId, ctx.session);
};
