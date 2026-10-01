import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { handleLinkTextInput } from "../commands/link";
import { handleGroupAnnouncementTextInput } from "../commands/groupAdmin";
import { handleRejectReasonTextInput } from "../commands/payments";
import { handleNoteTextInput } from "../commands/learn";
import { handleCouponTextInput, handleSearchTextInput, handleTxidTextInput } from "../commands/catalog";
import { handleToolTextInput } from "../commands/mentorTools";
import { isWizardExpired, clearWizard } from "./wizard";

/**
 * Where free text goes. Only a private chat reaches the flows below (a link
 * code, a reject reason, a group announcement); everything else falls through.
 */
export function registerTextRouter(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.on("text", async (ctx, next) => {
    if (ctx.chatMode !== "private") return next();
    const text = ctx.message.text;

    if (ctx.session.awaitingLinkToken) {
      return handleLinkTextInput(ctx, services, text);
    }

    if (ctx.session.wizard) {
      if (isWizardExpired(ctx)) {
        await ctx.reply("⌛ That session expired. Please start again.");
        return;
      }

      switch (ctx.session.wizard.name) {
        case "paymentreject":
          return handleRejectReasonTextInput(ctx, services, text);
        case "groupannounce":
          return handleGroupAnnouncementTextInput(ctx, services, text);
        case "note":
          return handleNoteTextInput(ctx, services, text);
        case "search":
          return handleSearchTextInput(ctx, services, text);
        case "coupon":
          return handleCouponTextInput(ctx, services, text);
        case "txid":
          return handleTxidTextInput(ctx, services, text);
        case "tool":
          return handleToolTextInput(ctx, services, text);
        default:
          clearWizard(ctx);
      }
    }

    return next();
  });
}
