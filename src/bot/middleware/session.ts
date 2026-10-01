import type { MiddlewareFn } from "telegraf";
import type { BotSession, ProggaaBotContext } from "../../types/session";

/**
 * In-memory session per chat. Sessions hold only short-lived conversation
 * state, so a session that has been idle for a few hours is dropped, and the
 * store is capped, which stops a flood of new chats from growing memory forever.
 */
const SESSION_IDLE_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 5000;

const store = new Map<number, BotSession>();

function evict(now: number) {
  if (store.size < MAX_SESSIONS) return;
  for (const [chatId, session] of store) {
    if (now - (session.lastSeenAt ?? 0) > SESSION_IDLE_MS) store.delete(chatId);
  }
  // Still full: drop the oldest entries (a Map iterates in insertion order).
  for (const chatId of store.keys()) {
    if (store.size < MAX_SESSIONS) break;
    store.delete(chatId);
  }
}

export const sessionMiddleware: MiddlewareFn<ProggaaBotContext> = async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    ctx.session = {};
    return next();
  }

  const now = Date.now();
  evict(now);

  const existing = store.get(chatId);
  ctx.session = existing && now - (existing.lastSeenAt ?? now) <= SESSION_IDLE_MS ? existing : {};
  ctx.session.lastSeenAt = now;

  await next();

  // Re-insert so the most recently used chats are the last to be evicted.
  store.delete(chatId);
  store.set(chatId, ctx.session);
};
