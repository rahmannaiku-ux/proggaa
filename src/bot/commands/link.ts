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
} from "../messages/copy";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { logger } from "../../utils/logger";

export function registerLinkCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("link", async (ctx) => {
    await handleLinkStart(ctx, services);
  });

  bot.action("start:link", async (ctx) => {
    await ctx.answerCbQuery();
    await handleLinkStart(ctx, services);
  });
}

async function handleLinkStart(ctx: ProggaaBotContext, services: ServiceContainer) {
  const existing = await services.linkService.getLinkedAccount(ctx.auth.telegramId);
  if (existing) {
    await ctx.reply(LINK_ALREADY_LINKED, backToMenuKeyboard());
    return;
  }

  ctx.session.awaitingLinkToken = true;
  await ctx.reply(LINK_INTRO, { parse_mode: "Markdown" });
}

/** Called by the central text router (see bot/handlers/textRouter.ts) when awaitingLinkToken is set. */
export async function handleLinkTextInput(ctx: ProggaaBotContext, services: ServiceContainer, rawToken: string) {
  ctx.session.awaitingLinkToken = false;
  await completeLinking(ctx, services, rawToken.trim());
}

async function completeLinking(ctx: ProggaaBotContext, services: ServiceContainer, token: string) {
  if (!token) {
    await ctx.reply(LINK_INVALID_OR_EXPIRED);
    return;
  }

  logger.audit("link.attempt", { telegramId: ctx.auth.telegramId });

  try {
    const result = await services.linkService.linkWithToken(ctx.auth.telegramId, token);
    const user = await services.userService.getUserById(result.proggaaUserId);
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
      await ctx.reply(LINK_INVALID_OR_EXPIRED);
      return;
    }
    throw error; // let the global error handler catch anything unexpected
  }
}
