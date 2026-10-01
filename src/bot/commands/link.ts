import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import {
  AccountMismatchError,
  AlreadyLinkedError,
  InvalidOrExpiredTokenError,
} from "../../services/proggaa/errors";
import {
  LINK_ACCOUNT_MISMATCH,
  LINK_ALREADY_LINKED,
  LINK_INTRO,
  LINK_INVALID_OR_EXPIRED,
  LINK_SUCCESS,
  UNLINK_CONFIRM,
  UNLINK_NOT_LINKED,
  UNLINK_SUCCESS,
} from "../messages/copy";
import { backToMenuKeyboard, confirmKeyboard } from "../keyboards/mainMenu";
import { linkAttempts } from "../middleware/rateLimit";
import { normalizeLinkCode } from "../../utils/validation";
import { logger } from "../../utils/logger";

export function registerLinkCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("link", async (ctx) => {
    await handleLinkStart(ctx, services);
  });

  bot.action("start:link", async (ctx) => {
    await ctx.answerCbQuery();
    await handleLinkStart(ctx, services);
  });

  bot.command("unlink", async (ctx) => {
    if (!ctx.auth.linked) {
      await ctx.reply(UNLINK_NOT_LINKED);
      return;
    }
    await ctx.reply(UNLINK_CONFIRM, confirmKeyboard("unlink:confirm", "unlink:cancel", "✅ Disconnect"));
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
    await ctx.editMessageText("Cancelled. Your account is still connected.", backToMenuKeyboard());
  });
}

async function handleLinkStart(ctx: ProggaaBotContext, services: ServiceContainer) {
  // A link code is a secret: only ever accept it in a private chat.
  if (ctx.chatMode !== "private") return;

  const existing = await services.linkService.getLinkedAccount(ctx.auth.telegramId);
  if (existing) {
    await ctx.reply(LINK_ALREADY_LINKED, backToMenuKeyboard());
    return;
  }

  ctx.session.awaitingLinkToken = true;
  await ctx.reply(LINK_INTRO, { parse_mode: "Markdown" });
}

/** Called by the text router when the next message should be a link code. */
export async function handleLinkTextInput(ctx: ProggaaBotContext, services: ServiceContainer, rawToken: string) {
  ctx.session.awaitingLinkToken = false;
  if (ctx.chatMode !== "private") return;

  if (!linkAttempts.hit(ctx.auth.telegramId)) {
    logger.audit("link.rate_limited", { telegramId: ctx.auth.telegramId });
    await ctx.reply("⏳ Too many attempts. Please wait a few minutes and generate a fresh code.");
    return;
  }

  // Check the shape before the code goes anywhere: it is a secret, not free text.
  const token = normalizeLinkCode(rawToken);
  if (!token) {
    await ctx.reply(LINK_INVALID_OR_EXPIRED);
    return;
  }

  logger.audit("link.attempt", { telegramId: ctx.auth.telegramId });

  try {
    const result = await services.linkService.linkWithToken(ctx.auth.telegramId, token);
    const user = await services.userService.getUserById(result.proggaaUserId);
    logger.audit("link.succeeded", { telegramId: ctx.auth.telegramId, proggaaUserId: result.proggaaUserId });
    await ctx.reply(LINK_SUCCESS(user?.name ?? "there", result.role), {
      parse_mode: "Markdown",
      ...backToMenuKeyboard(),
    });
  } catch (error) {
    if (error instanceof AlreadyLinkedError) {
      await ctx.reply(LINK_ALREADY_LINKED);
      return;
    }
    if (error instanceof AccountMismatchError) {
      await ctx.reply(LINK_ACCOUNT_MISMATCH);
      return;
    }
    if (error instanceof InvalidOrExpiredTokenError) {
      logger.audit("link.failed_invalid_token", { telegramId: ctx.auth.telegramId });
      await ctx.reply(LINK_INVALID_OR_EXPIRED);
      return;
    }
    throw error; // the global error handler shows a friendly message
  }
}
