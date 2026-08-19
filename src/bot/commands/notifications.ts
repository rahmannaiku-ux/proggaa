import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";

export function registerNotificationsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("notifications", async (ctx) => {
    await sendNotifications(ctx, services);
  });

  bot.action("menu:notifications", async (ctx) => {
    await ctx.answerCbQuery();
    await sendNotifications(ctx, services);
  });
}

async function sendNotifications(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const events = await services.notificationService.getRecentNotifications(ctx.auth.proggaaUserId!, 10);

  if (events.length === 0) {
    await ctx.reply(
      "🔔 No notifications yet. You'll see exam reminders, results, and other updates here as they happen.",
      backToMenuKeyboard()
    );
    return;
  }

  const body = events.map((e) => `${e.title}\n${e.body}`).join("\n\n");
  await ctx.reply(`🔔 *Recent Notifications*\n\n${body}`, {
    parse_mode: "Markdown",
    ...backToMenuKeyboard(),
  });
}
