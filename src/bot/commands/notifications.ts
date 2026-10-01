import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import type { NotificationCategory, NotificationPreferences } from "../../types/domain";
import { requireLinked } from "../middleware/guards";
import { formatNotificationLine } from "../messages/formatters";
import { ICON, TERMS, heading } from "../messages/brand";
import { ALL_CATEGORIES } from "../../services/notifications/PreferenceService";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  EXAM_REMINDERS: `${TERMS.exam} reminders`,
  RESULTS: "Results and grades",
  LIVE_CLASSES: "Live class reminders",
  ANNOUNCEMENTS: "Announcements",
  MISSIONS: `${TERMS.course} enrolments`,
  CHALLENGES: `${TERMS.assignment}s`,
  ACHIEVEMENTS: "Achievements and Medals",
  STREAK: "Streak reminders",
  PAYMENTS: "Payments",
  SYSTEM: "Proggaa updates",
};

export function registerNotificationsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("notifications", async (ctx) => {
    await sendNotifications(ctx, services);
  });
  bot.action("menu:notifications", async (ctx) => {
    await ctx.answerCbQuery();
    await sendNotifications(ctx, services);
  });

  bot.command("settings", async (ctx) => {
    await sendSettings(ctx, services);
  });
  bot.action("menu:settings", async (ctx) => {
    await ctx.answerCbQuery();
    await sendSettings(ctx, services);
  });

  // Category ids come from a fixed list; anything else is ignored.
  const toggle = new RegExp(`^settings:toggle:(${ALL_CATEGORIES.join("|")})$`);
  bot.action(toggle, async (ctx) => {
    if (await requireLinked(ctx)) {
      await ctx.answerCbQuery();
      return;
    }
    const category = ctx.match[1] as NotificationCategory;
    const id = ctx.auth.proggaaUserId!;
    const current = await services.preferenceService.getPreferences(id);
    const updated = await services.preferenceService.setPreference(id, category, !current.categories[category]);

    await ctx.answerCbQuery(updated.categories[category] ? "Turned on" : "Turned off");
    await ctx.editMessageText(settingsText(), { parse_mode: "Markdown", ...settingsKeyboard(updated) });
  });
}

async function sendNotifications(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const items = await services.notificationService.getRecentNotifications(ctx.auth.proggaaUserId!, 8);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url("Open all on Proggaa", services.deepLinkService.notifications())],
    [Markup.button.callback(`${ICON.settings} Settings`, "menu:settings"), Markup.button.callback("⬅️ Menu", "menu:home")],
  ]);

  if (items.length === 0) {
    await ctx.reply(`${heading(ICON.bell, "Notifications")}\n\nAll quiet. New ones will appear here and arrive in this chat.`, {
      parse_mode: "Markdown",
      ...keyboard,
    });
    return;
  }

  await ctx.reply(`${heading(ICON.bell, "Notifications")}\n\n${items.map(formatNotificationLine).join("\n\n")}`, {
    parse_mode: "Markdown",
    ...keyboard,
  });
}

async function sendSettings(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;
  const prefs = await services.preferenceService.getPreferences(ctx.auth.proggaaUserId!);
  await ctx.reply(settingsText(), { parse_mode: "Markdown", ...settingsKeyboard(prefs) });
}

function settingsText(): string {
  return `${heading(ICON.settings, "Telegram notifications")}\n\nChoose which Proggaa notifications are sent to this chat. Everything still appears on the website.`;
}

function settingsKeyboard(prefs: NotificationPreferences) {
  const rows = ALL_CATEGORIES.map((category) => [
    Markup.button.callback(`${prefs.categories[category] ? ICON.done : "⬜"} ${CATEGORY_LABELS[category]}`, `settings:toggle:${category}`),
  ]);
  rows.push([Markup.button.callback("⬅️ Menu", "menu:home")]);
  return Markup.inlineKeyboard(rows);
}
