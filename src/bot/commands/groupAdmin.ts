import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { backToMenuKeyboard, confirmKeyboard } from "../keyboards/mainMenu";
import { esc } from "../messages/brand";
import { startWizard, clearWizard } from "../handlers/wizard";
import { TEXT_LIMITS, validateBoundedText } from "../../utils/validation";
import { logger } from "../../utils/logger";

// A Telegram group id is a (usually negative) number. Anything else in a button is not ours.
const CHAT_ID = "-?\\d{5,20}";

/**
 * Admin tools for the Group Assistant: which Telegram groups the bot manages
 * and what it does there. This belongs to the bot (it is about Telegram groups,
 * not Proggaa data). Every action re-checks the admin role, and a group id taken
 * from a button is only accepted if that group is on the configured list.
 */
export function registerGroupAdmin(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  const groups = services.groupService;

  bot.action("admin:moderation", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const events = groups.getRecentEscalations();
    if (events.length === 0) {
      await ctx.reply("🚨 No group moderation escalations recorded.", backToMenuKeyboard());
      return;
    }
    const lines = events
      .slice(0, 15)
      .map((e) => `${e.action === "ADMIN_ALERT" ? "🔴" : "🟠"} ${esc(e.reason)} · chat ${e.chatId} · user ${e.telegramId}`);
    await ctx.reply(`🚨 *Group moderation*\n\n${lines.join("\n")}`, { parse_mode: "Markdown", ...backToMenuKeyboard() });
  });

  bot.action("admin:groupsettings", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const configured = groups.listConfiguredGroups();
    if (configured.length === 0) {
      await ctx.reply("⚙️ No groups are configured. Set PROGGAA_GROUP_IDS to add one.", backToMenuKeyboard());
      return;
    }
    const rows = configured.map((chatId) => [Markup.button.callback(`Group ${chatId}`, `admin:groupsettings:view:${chatId}`)]);
    rows.push([Markup.button.callback("⬅️ Menu", "menu:home")]);
    await ctx.reply("⚙️ *Group settings*\n\nPick a group.", { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });

  bot.action(new RegExp(`^admin:groupsettings:view:(${CHAT_ID})$`), async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const chatId = ctx.match[1]!;
    if (!groups.isConfiguredGroup(chatId)) return;
    await sendGroupSettingsView(ctx, services, chatId);
  });

  bot.action(new RegExp(`^admin:groupsettings:toggle:(${CHAT_ID}):(welcomeEnabled|faqEnabled|moderationEnabled)$`), async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const chatId = ctx.match[1]!;
    if (!groups.isConfiguredGroup(chatId)) return;

    const field = ctx.match[2] as "welcomeEnabled" | "faqEnabled" | "moderationEnabled";
    const current = groups.getSettings(chatId);
    groups.updateSettings(chatId, { [field]: !current[field] });
    logger.audit("group.settings_toggled", { chatId, field, telegramId: ctx.auth.telegramId });
    await sendGroupSettingsView(ctx, services, chatId);
  });

  // Announcements to the managed groups: write, preview, then explicit confirmation.
  bot.action("admin:groupannounce", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const configured = groups.listConfiguredGroups();
    if (configured.length === 0) {
      await ctx.reply("📢 No groups are configured yet. Set PROGGAA_GROUP_IDS to enable group announcements.", backToMenuKeyboard());
      return;
    }
    startWizard(ctx, "groupannounce", "awaiting_message", {});
    await ctx.reply(`✍️ Send the announcement. It goes to ${configured.length} group${configured.length === 1 ? "" : "s"}.`);
  });

  bot.action("groupannounce:send:confirm", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "groupannounce" || !wizard.data.message) {
      await ctx.reply("That session expired. Start again from /admin.");
      return;
    }

    const configured = groups.listConfiguredGroups();
    const text = `📢 *Proggaa announcement*\n\n${esc(wizard.data.message)}`;
    let sent = 0;
    for (const chatId of configured) {
      try {
        await ctx.telegram.sendMessage(chatId, text, { parse_mode: "Markdown" });
        sent += 1;
      } catch (error) {
        logger.warn("group_announcement.send_failed", { chatId, error: String(error) });
      }
    }
    logger.audit("group_announcement.sent_via_bot", { telegramId: ctx.auth.telegramId, groupCount: configured.length, sentCount: sent });
    await ctx.editMessageText(`✅ Sent to ${sent}/${configured.length} group${configured.length === 1 ? "" : "s"}.`);
    clearWizard(ctx);
  });

  bot.action("groupannounce:send:cancel", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    clearWizard(ctx);
    await ctx.editMessageText("Cancelled. Nothing was sent.");
  });
}

/** Called by the text router when a group announcement is being written. */
export async function handleGroupAnnouncementTextInput(ctx: ProggaaBotContext, _services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "groupannounce" || wizard.step !== "awaiting_message") return;
  if (await requireRole(ctx, ["ADMIN"])) {
    clearWizard(ctx);
    return;
  }

  const validated = validateBoundedText(text, TEXT_LIMITS.groupAnnouncement);
  if (!validated.ok) {
    await ctx.reply(`The announcement ${validated.error}. Please try again.`);
    return;
  }

  wizard.data.message = validated.value;
  wizard.step = "confirming";
  await ctx.reply(`📢 *Preview*\n\n${esc(validated.value)}\n\nSend this to all managed groups?`, {
    parse_mode: "Markdown",
    ...confirmKeyboard("groupannounce:send:confirm", "groupannounce:send:cancel", "📢 Send"),
  });
}

async function sendGroupSettingsView(ctx: ProggaaBotContext, services: ServiceContainer, chatId: string) {
  const settings = services.groupService.getSettings(chatId);
  const lines = [
    `⚙️ *Group ${chatId}*`,
    "",
    `👋 Welcome messages: ${settings.welcomeEnabled ? "on" : "off"}`,
    `❓ FAQ answers: ${settings.faqEnabled ? "on" : "off"}`,
    `🚨 Moderation: ${settings.moderationEnabled ? "on" : "off"}`,
  ];
  if (settings.bannedKeywords.length > 0) lines.push(`🔑 Extra banned keywords: ${esc(settings.bannedKeywords.join(", "))}`);

  const flip = (on: boolean, label: string) => `${on ? "Turn off" : "Turn on"} ${label}`;
  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback(flip(settings.welcomeEnabled, "welcome"), `admin:groupsettings:toggle:${chatId}:welcomeEnabled`)],
      [Markup.button.callback(flip(settings.faqEnabled, "FAQ"), `admin:groupsettings:toggle:${chatId}:faqEnabled`)],
      [Markup.button.callback(flip(settings.moderationEnabled, "moderation"), `admin:groupsettings:toggle:${chatId}:moderationEnabled`)],
      [Markup.button.callback("⬅️ Groups", "admin:groupsettings")],
    ]),
  });
}
