import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { handleLinkTextInput } from "../commands/link";
import { handleSupportTextInput } from "../commands/support";
import { handleAITextInput } from "../commands/ai";
import { handleAnnouncementTextInput } from "../commands/teacher";
import { handleGroupAnnouncementTextInput } from "../commands/admin";
import { handleStaffReplyTextInput } from "../commands/tickets";
import { handleStudyTextInput } from "../commands/study";
import { handlePaymentTxidTextInput } from "../commands/payments";
import { isWizardExpired, clearWizard } from "./wizard";

/**
 * Every free-text conversational flow (account linking, support tickets,
 * AI generation inputs, ...) funnels through this single handler instead
 * of each command registering its own `bot.on("text", ...)`. That keeps
 * ordering unambiguous — one place decides who "owns" the next text
 * message, based on session state — and gives a single spot to enforce
 * wizard expiration.
 */
export function registerTextRouter(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text;

    if (ctx.session.awaitingLinkToken) {
      return handleLinkTextInput(ctx, services, text);
    }

    if (ctx.session.wizard) {
      if (isWizardExpired(ctx)) {
        await ctx.reply("⌛ That session expired. Please start again.");
        return;
      }

      if (ctx.session.wizard.name === "support") {
        return handleSupportTextInput(ctx, services, text);
      }
      if (ctx.session.wizard.name === "ai") {
        return handleAITextInput(ctx, services, text);
      }
      if (ctx.session.wizard.name === "announcement") {
        return handleAnnouncementTextInput(ctx, services, text);
      }
      if (ctx.session.wizard.name === "groupannounce") {
        return handleGroupAnnouncementTextInput(ctx, services, text);
      }
      if (ctx.session.wizard.name === "staffreply") {
        return handleStaffReplyTextInput(ctx, services, text);
      }
      if (ctx.session.wizard.name === "study") {
        return handleStudyTextInput(ctx, services, text);
      }
      if (ctx.session.wizard.name === "paymenttxid") {
        return handlePaymentTxidTextInput(ctx, services, text);
      }

      // Unknown wizard name — don't get stuck, clear it and fall through.
      clearWizard(ctx);
    }

    return next();
  });
}
