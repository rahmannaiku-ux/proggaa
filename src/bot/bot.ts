import { Telegraf } from "telegraf";
import { env } from "../config/env";
import type { ServiceContainer } from "../services/container";
import type { AuthContext, BotSession, ProggaaBotContext } from "../types/session";
import { logger } from "../utils/logger";

import { errorHandlerMiddleware } from "./middleware/errorHandler";
import { requestLoggerMiddleware } from "./middleware/requestLogger";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { sessionMiddleware } from "./middleware/session";
import { createAuthMiddleware } from "./middleware/auth";
import { createChatScopeMiddleware } from "./middleware/chatScope";

import { registerStartCommand } from "./commands/start";
import { registerLinkCommand } from "./commands/link";
import { registerDashboardCommand } from "./commands/dashboard";
import { registerMissionsCommand } from "./commands/missions";
import { registerExamsCommand } from "./commands/exams";
import { registerResultsCommand } from "./commands/results";
import { registerLiveCommand } from "./commands/live";
import { registerWalletCommand } from "./commands/wallet";
import { registerAchievementsCommand } from "./commands/achievements";
import { registerProgressCommand } from "./commands/progress";
import { registerNotificationsCommand } from "./commands/notifications";
import { registerPaymentsCommand } from "./commands/payments";
import { registerSupportCommand } from "./commands/support";
import { registerLearnCommands } from "./commands/learn";
import { registerCatalogCommands } from "./commands/catalog";
import { registerStoreCommands } from "./commands/store";
import { registerSocialCommands } from "./commands/social";
import { registerMentorTools } from "./commands/mentorTools";
import { registerEditorCommands } from "./commands/editor";
import { registerAdminManageCommands } from "./commands/adminManage";
import { registerProfileCommands } from "./commands/profile";
import { registerTeacherCommand } from "./commands/teacher";
import { registerAdminCommand } from "./commands/admin";
import { registerGroupAssistant } from "./commands/group";
import { registerTextRouter } from "./handlers/textRouter";

export function createBot(services: ServiceContainer, token: string = env.BOT_TOKEN): Telegraf<ProggaaBotContext> {
  const bot = new Telegraf<ProggaaBotContext>(token);

  // Order matters: errors are caught first, then the person is identified, then
  // the chat is classified (personal or group) before any handler runs.
  bot.use(async (ctx, next) => {
    ctx.session = ctx.session ?? ({} as BotSession);
    ctx.auth = ctx.auth ?? ({ telegramId: "unknown", linked: false } as AuthContext);
    await next();
  });
  bot.use(errorHandlerMiddleware);
  bot.use(requestLoggerMiddleware);
  bot.use(rateLimitMiddleware);
  bot.use(sessionMiddleware);
  bot.use(createAuthMiddleware(services));
  bot.use(createChatScopeMiddleware(services));

  registerStartCommand(bot, services);
  registerLinkCommand(bot, services);

  // Heroes
  registerDashboardCommand(bot, services);
  registerMissionsCommand(bot, services);
  registerExamsCommand(bot, services);
  registerResultsCommand(bot, services);
  registerLiveCommand(bot, services);
  registerWalletCommand(bot, services);
  registerAchievementsCommand(bot, services);
  registerProgressCommand(bot, services);
  registerNotificationsCommand(bot, services);
  registerPaymentsCommand(bot, services);
  registerSupportCommand(bot, services);
  registerLearnCommands(bot, services);
  registerCatalogCommands(bot, services);
  registerStoreCommands(bot, services);
  registerSocialCommands(bot, services);
  registerProfileCommands(bot, services);

  // Mentors and admins
  registerTeacherCommand(bot, services);
  registerMentorTools(bot, services);
  registerEditorCommands(bot, services);
  registerAdminCommand(bot, services);
  registerAdminManageCommands(bot, services);

  // Group Assistant: the same bot in a configured Telegram group. Registered
  // after the commands, before the text router; chatScope keeps the two modes apart.
  registerGroupAssistant(bot, services);

  registerTextRouter(bot, services);

  bot.catch((err, ctx) => {
    logger.error("bot.catch", {
      error: err instanceof Error ? err.message : String(err),
      updateType: ctx.updateType,
    });
  });

  return bot;
}
