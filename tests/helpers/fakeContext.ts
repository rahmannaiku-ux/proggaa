import { vi } from "vitest";
import type { ProggaaBotContext, AuthContext, BotSession } from "../../src/types/session";

/**
 * A minimal fake Telegraf context good enough to drive the exported
 * `send*` command functions directly (bypassing real Telegram transport).
 * Captures every `reply()` call so tests can assert on message content.
 */
export function fakeContext(auth: Partial<AuthContext> = {}, session: BotSession = {}): ProggaaBotContext {
  const replies: { text: string; extra?: unknown }[] = [];

  const ctx = {
    auth: { telegramId: "tg_fake", linked: false, ...auth },
    session,
    chat: { id: 1 },
    reply: vi.fn(async (text: string, extra?: unknown) => {
      replies.push({ text, extra });
      return { message_id: replies.length } as any;
    }),
    editMessageText: vi.fn(async (text: string, extra?: unknown) => {
      replies.push({ text, extra });
      return true as any;
    }),
    answerCbQuery: vi.fn(async () => true as any),
  } as unknown as ProggaaBotContext & { __replies: typeof replies };

  (ctx as any).__replies = replies;
  return ctx;
}

export function repliesOf(ctx: ProggaaBotContext): { text: string; extra?: unknown }[] {
  return (ctx as any).__replies;
}
