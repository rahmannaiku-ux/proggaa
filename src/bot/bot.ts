import { Telegraf } from "telegraf";
import { env } from "../config/env";
import type { ProggaaBotContext, BotSession, AuthContext } from "../types/session";
import type { ServiceContainer } from "../services/container";
import { logger } from "../utils/logger";

import { sessionMiddleware } from "./middleware/session";
import { createAuthMiddleware } from "./middleware/auth";
import { createChatScopeMiddleware } from "./middleware/chatScope";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { errorHandlerMiddleware } from "./middleware/errorHandler";
import { requestLoggerMiddleware } from "./middleware/requestLogger";

import { registerStartCommand } from "./commands/start";
import { registerHelpCommand } from "./commands/help";
import { registerLinkCommand } from "./commands/link";
import { registerUnlinkCommand } from "./commands/unlink";
import { registerDevTokenCommand } from "./commands/devtoken";
import { registerMenuHomeAction } from "./commands/menu";

import { registerDashboardCommand } from "./commands/dashboard";
import { registerCoursesCommand } from "./commands/courses";
import { registerExamsCommand } from "./commands/exams";
import { registerResultsCommand } from "./commands/results";
import { registerAchievementsCommand } from "./commands/achievements";
import { registerNotificationsCommand } from "./commands/notifications";
import { registerSettingsCommand } from "./commands/settings";

import { registerTeacherCommand } from "./commands/teacher";
import { registerAdminCommand } from "./commands/admin";
import { registerStatsCommand } from "./commands/stats";
import { registerPaymentsCommand } from "./commands/payments";
import { registerSupportCommand } from "./commands/support";
import { registerStaffTicketActions } from "./commands/tickets";
import { registerAICommand } from "./commands/ai";
import { registerStudyCommand } from "./commands/study";
import { registerProgressCommand } from "./commands/progress";
import { registerAnalysisCommand } from "./commands/analysis";
import { registerStudyPlanCommand } from "./commands/studyplan";
import { registerExamHelpCommand } from "./commands/examhelp";
import { registerGroupAssistant } from "./commands/group";

import { registerTextRouter } from "./handlers/textRouter";

export function createBot(services: ServiceContainer): Telegraf<ProggaaBotContext> {
  const bot = new Telegraf<ProggaaBotContext>(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    (ctx as ProggaaBotContext).session = (ctx as ProggaaBotContext).session ?? ({} as BotSession);
    (ctx as ProggaaBotContext).auth =
      (ctx as ProggaaBotContext).auth ?? ({ telegramId: "unknown", linked: false } as AuthContext);
    await next();
  });

  bot.use(errorHandlerMiddleware);
  bot.use(requestLoggerMiddleware);
  bot.use(rateLimitMiddleware);
  bot.use(sessionMiddleware);
  bot.use(createAuthMiddleware(services));
  bot.use(createChatScopeMiddleware(services));

  // Phase 2 & 4: core + linking
  registerStartCommand(bot, services);
  registerHelpCommand(bot);
  registerLinkCommand(bot, services);
  registerUnlinkCommand(bot, services);
  registerDevTokenCommand(bot);
  registerMenuHomeAction(bot, services);

  // Phase 5 & 6: dashboards + courses/exams/results/achievements
  registerDashboardCommand(bot, services);
  registerCoursesCommand(bot, services);
  registerExamsCommand(bot, services);
  registerResultsCommand(bot, services);
  registerAchievementsCommand(bot, services);

  // Phase 7: notifications
  registerNotificationsCommand(bot, services);
  registerSettingsCommand(bot, services);

  // Phase 8 & 9: teacher / admin
  registerTeacherCommand(bot, services);
  registerAdminCommand(bot, services);
  registerStatsCommand(bot, services);

  // Phase 10: payments
  registerPaymentsCommand(bot, services);

  // Phase 11: support
  registerSupportCommand(bot, services);
  registerStaffTicketActions(bot, services);

  // Phase 12 & 13: AI + question bank
  registerAICommand(bot, services);
  registerStudyCommand(bot, services);
  registerProgressCommand(bot, services);
  registerAnalysisCommand(bot, services);
  registerStudyPlanCommand(bot, services);
  registerExamHelpCommand(bot, services);

  // Group Assistant: same bot, group-chat mode. Registered after every
  // command handler (so /commands still resolve normally in a group) and
  // before the text router (private-chat wizards never see group updates
  // and vice versa — chatScopeMiddleware keeps the two modes separated).
  registerGroupAssistant(bot, services);

  // Central free-text router. bot.command() handlers always match a
  // "/command" message before this generic bot.on("text") handler gets a
  // chance to see it, regardless of relative registration order, so it's
  // safe to register last.
  registerTextRouter(bot, services);

  bot.catch((err, ctx) => {
    logger.error("bot.catch", {
      error: err instanceof Error ? err.message : String(err),
      updateType: ctx.updateType,
    });
  });

  return bot;
}
