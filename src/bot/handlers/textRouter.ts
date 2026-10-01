import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { handleLinkTextInput } from "../commands/link";
import { handleGroupAnnouncementTextInput } from "../commands/groupAdmin";
import { handleRejectReasonTextInput } from "../commands/payments";
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
        default:
          clearWizard(ctx);
      }
    }

    return next();
  });
}
