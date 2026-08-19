import type { MiddlewareFn } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";

/**
 * Commands that touch personal Proggaa data (courses, exams, results,
 * payments, support tickets, AI tutoring, account linking, ...) must never
 * run in a group chat — that's how personal information ends up visible to
 * everyone in the group. This is the single place that enforces that,
 * rather than relying on every command file to remember to check.
 */
const PRIVATE_ONLY_COMMANDS = new Set([
  "start",
  "dashboard",
  "courses",
  "exams",
  "results",
  "achievements",
  "notifications",
  "settings",
  "payments",
  "support",
  "ai",
  "study",
  "progress",
  "analysis",
  "studyplan",
  "examhelp",
  "link",
  "unlink",
  "devtoken",
  "menu",
]);

const PRIVATE_ONLY_ACTION_PREFIXES = [
  "menu:",
  "start:",
  "dashboard:",
  "courses:",
  "exams:",
  "results:",
  "achievements:",
  "notifications:",
  "settings:",
  "payments:",
  "mypayment:",
  "examhelp:",
  "support:",
  "ai:",
  "study:",
  "teacher:",
  "admin:",
  "staffticket:",
];

function parseCommand(text: string): string | undefined {
  const match = /^\/([a-zA-Z0-9_]+)/.exec(text);
  return match?.[1]?.toLowerCase();
}

/**
 * Sets `ctx.chatMode` (used by group.ts to decide whether to act at all)
 * and, for group/supergroup chats, blocks any command or callback that
 * belongs to Student/Teacher/Admin private-mode features.
 */
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

    // Block private-only commands.
    const messageText = ctx.message && "text" in ctx.message ? ctx.message.text : undefined;
    if (messageText) {
      const command = parseCommand(messageText);
      if (command && PRIVATE_ONLY_COMMANDS.has(command)) {
        await ctx.reply("🔒 That's a personal feature — please message me directly (open a private chat) to use it.");
        return;
      }
    }

    // Block private-only callback actions (in case an inline keyboard from
    // a private chat is somehow interacted with in a group context).
    const callbackData =
      ctx.callbackQuery && "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    if (callbackData && PRIVATE_ONLY_ACTION_PREFIXES.some((prefix) => callbackData.startsWith(prefix))) {
      await ctx.answerCbQuery("Please continue this in a private chat with me.", { show_alert: true });
      return;
    }

    return next();
  };
}
