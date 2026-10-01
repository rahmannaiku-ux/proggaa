import type { ExtraEditMessageText, ExtraReplyMessage } from "telegraf/typings/telegram-types";
import type { ProggaaBotContext } from "../types/session";
import type { ProggaaRole } from "../types/domain";
import { ProggaaServiceError, UnauthorizedError } from "../services/proggaa/errors";
import { requireLinked, requireRole } from "./middleware/guards";

type ScreenExtra = ExtraReplyMessage & ExtraEditMessageText;

/**
 * Shows a screen. When the person tapped a button the current message is edited in
 * place, so moving around Missions, Patrols or the store feels like an app and does not
 * pile up messages. A typed command, or a message that cannot be edited, sends a new one.
 */
export async function show(ctx: ProggaaBotContext, text: string, extra: ScreenExtra = {}): Promise<void> {
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, extra);
      return;
    } catch (error) {
      // Tapping the same button twice gives "message is not modified": nothing to do.
      if (error instanceof Error && /message is not modified/i.test(error.message)) return;
      // Anything else (an old or non-text message): fall through and send a fresh one.
    }
  }
  await ctx.reply(text, extra);
}

/** The id inside a button's callback data, as matched by the pattern given to bot.action. */
export function matchId(ctx: { match?: RegExpExecArray | RegExpMatchArray | null }, group = 1): string {
  return String(ctx.match?.[group] ?? "");
}

/**
 * Runs a screen that needs a linked person (and optionally one of some roles), and turns a
 * locked or refused answer from Proggaa into a plain message instead of an error.
 */
export async function guarded(
  ctx: ProggaaBotContext,
  roles: ProggaaRole[] | null,
  run: (userId: string) => Promise<void>
): Promise<void> {
  if (roles ? await requireRole(ctx, roles) : await requireLinked(ctx)) return;
  try {
    await run(ctx.auth.proggaaUserId!);
  } catch (error) {
    if (error instanceof UnauthorizedError || (error instanceof ProggaaServiceError && error.code === "VALIDATION_ERROR")) {
      await show(ctx, `⚠️ ${error.message}`);
      return;
    }
    throw error;
  }
}
