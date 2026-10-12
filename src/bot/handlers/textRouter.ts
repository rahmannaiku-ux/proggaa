import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { handleLinkTextInput } from "../commands/link";
import { handleGroupAnnouncementTextInput } from "../commands/groupAdmin";
import { handleRejectReasonTextInput } from "../commands/payments";
import { handleNoteTextInput } from "../commands/learn";
import { handleCouponTextInput, handleSearchTextInput, handleTxidTextInput } from "../commands/catalog";
import { handleToolTextInput } from "../commands/mentorTools";
import { handleEditorTextInput } from "../commands/editor";
import { handleAdminManageTextInput } from "../commands/adminManage";
import { handleProfileTextInput } from "../commands/profile";
import { isWizardExpired, clearWizard } from "./wizard";
import { startKeyboard } from "../keyboards/mainMenu";
import { NOT_A_COMMAND_LINKED, NOT_A_COMMAND_UNLINKED, UNKNOWN_COMMAND } from "../messages/copy";

/**
 * Where free text goes. Only a private chat reaches the flows below (a link
 * code, a reject reason, a group announcement). Anything left over, including
 * a command nobody registered, gets a short reply with the menu, so a private
 * message is never met with silence. Group chatter is left alone.
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
        case "ed":
          return handleEditorTextInput(ctx, services, text);
        case "am":
          return handleAdminManageTextInput(ctx, services, text);
        case "profile":
          return handleProfileTextInput(ctx, services, text);
        default:
          clearWizard(ctx);
      }
    }

    const linked = ctx.auth.linked;
    const reply = text.startsWith("/") ? UNKNOWN_COMMAND : linked ? NOT_A_COMMAND_LINKED : NOT_A_COMMAND_UNLINKED;
    await ctx.reply(reply, startKeyboard(linked, ctx.auth.role));
  });
}
