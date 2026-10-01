import type { MiddlewareFn } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { isPlausibleCallbackData } from "../../utils/validation";

/**
 * Keeps personal features out of group chats.
 *
 * Anything that shows a person's own Proggaa data (or accepts a link code) must
 * only run in a private chat: in a group, everyone would read the answer, and a
 * pasted link code could be taken by someone else. So the rule is an allow-list:
 * in a group the bot answers ONLY the few commands listed here, plus the Group
 * Assistant's own behaviour. Every other command or button is refused, including
 * ones added in the future.
 */
const GROUP_SAFE_COMMANDS = new Set(["help"]);
const GROUP_SAFE_ACTION_PREFIXES = ["grouphelp:"];

function parseCommand(text: string): string | undefined {
  const match = /^\/([a-zA-Z0-9_]+)/.exec(text);
  return match?.[1]?.toLowerCase();
}

export function createChatScopeMiddleware(services: ServiceContainer): MiddlewareFn<ProggaaBotContext> {
  return async (ctx, next) => {
    const chatType = ctx.chat?.type;

    if (!chatType || chatType === "private") {
      ctx.chatMode = "private";
      return next();
    }

    if (chatType === "group" || chatType === "supergroup") {
      const chatId = ctx.chat?.id?.toString();
      ctx.chatMode = chatId && services.groupService.isConfiguredGroup(chatId) ? "configured_group" : "unconfigured_group";
    } else {
      ctx.chatMode = "other";
    }

    const messageText = ctx.message && "text" in ctx.message ? ctx.message.text : undefined;
    if (messageText) {
      const command = parseCommand(messageText);
      if (command && !GROUP_SAFE_COMMANDS.has(command)) {
        await ctx.reply("🔒 That's personal. Message me directly (a private chat) to use it.");
        return;
      }
    }

    const callbackData = ctx.callbackQuery && "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    if (callbackData !== undefined) {
      if (!isPlausibleCallbackData(callbackData) || !GROUP_SAFE_ACTION_PREFIXES.some((p) => callbackData.startsWith(p))) {
        await ctx.answerCbQuery("Please continue in a private chat with me.", { show_alert: true });
        return;
      }
    }

    return next();
  };
}
