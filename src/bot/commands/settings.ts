import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { NotificationCategory, NotificationPreferences } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  EXAM_REMINDERS: "🔔 Exam reminders",
  RESULTS: "🔔 Results",
  COURSE_UPDATES: "🔔 Course updates",
  ASSIGNMENTS: "🔔 Assignments",
  ACHIEVEMENTS: "🔔 Achievements",
  PAYMENTS: "🔔 Payments",
  SUPPORT_UPDATES: "🔔 Support ticket replies",
  TEACHER_ALERTS: "🔔 Teacher alerts",
  SYSTEM_ALERTS: "🔔 System alerts",
};

const CATEGORY_ORDER: NotificationCategory[] = Object.keys(CATEGORY_LABELS) as NotificationCategory[];

export function registerSettingsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("settings", async (ctx) => {
    await sendSettings(ctx, services);
  });

  bot.action("menu:settings", async (ctx) => {
    await ctx.answerCbQuery();
    await sendSettings(ctx, services);
  });

  bot.action(/^settings:toggle:(.+)$/, async (ctx) => {
    if (await requireLinked(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const category = ctx.match[1] as NotificationCategory;
    if (!CATEGORY_ORDER.includes(category)) {
      await ctx.answerCbQuery("Unknown setting.");
      return;
    }

    const current = await services.notificationPreferenceService.getPreferences(ctx.auth.proggaaUserId!);
    const updated = await services.notificationPreferenceService.setPreference(
      ctx.auth.proggaaUserId!,
      category,
      !current.categories[category]
    );

    await ctx.answerCbQuery(updated.categories[category] ? "Enabled" : "Disabled");
    await ctx.editMessageText(settingsText(), {
      parse_mode: "Markdown",
      ...settingsKeyboard(updated),
    });
  });
}

function settingsText(): string {
  return "⚙️ *Notification Settings*\n\nTap a category to toggle it on/off.";
}

function settingsKeyboard(prefs: NotificationPreferences) {
  const rows = CATEGORY_ORDER.map((category) => [
    Markup.button.callback(
      `${prefs.categories[category] ? "✅" : "⬜"} ${CATEGORY_LABELS[category].replace("🔔 ", "")}`,
      `settings:toggle:${category}`
    ),
  ]);
  rows.push([Markup.button.callback("⬅️ Back to Menu", "menu:home")]);
  return Markup.inlineKeyboard(rows);
}

async function sendSettings(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;
  const prefs = await services.notificationPreferenceService.getPreferences(ctx.auth.proggaaUserId!);
  await ctx.reply(settingsText(), { parse_mode: "Markdown", ...settingsKeyboard(prefs) });
}
