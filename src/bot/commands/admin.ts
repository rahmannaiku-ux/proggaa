import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { AlertSeverity } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { adminDashboardKeyboard, backToMenuKeyboard, confirmKeyboard } from "../keyboards/mainMenu";
import { sendPendingPayments } from "./payments";
import { sendStats } from "./stats";
import { startWizard, clearWizard } from "../handlers/wizard";
import { validateBoundedText, TEXT_LIMITS } from "../../utils/validation";
import { logger } from "../../utils/logger";

export function registerAdminCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("admin", async (ctx) => {
    await sendAdminDashboard(ctx, services);
  });

  bot.action("admin:payments", async (ctx) => {
    await ctx.answerCbQuery();
    await sendPendingPayments(ctx, services);
  });

  bot.action("admin:users", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const [students, teachers, admins] = await Promise.all([
      services.adminService.listUsers("STUDENT"),
      services.adminService.listUsers("TEACHER"),
      services.adminService.listUsers("ADMIN"),
    ]);
    await ctx.reply(
      `👥 *Users*\n\n🎓 Students: ${students.length}\n👨‍🏫 Teachers: ${teachers.length}\n👨‍💼 Admins: ${admins.length}`,
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
  });

  bot.action("admin:courses", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const stats = await services.adminService.getStatistics();
    await ctx.reply(`📚 ${stats.courseCount.toLocaleString()} courses on the platform.`, backToMenuKeyboard());
  });

  bot.action("admin:exams", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const stats = await services.adminService.getStatistics();
    await ctx.reply(
      `📝 ${stats.examCount.toLocaleString()} exams total, ${stats.liveExamCount} live right now.`,
      backToMenuKeyboard()
    );
  });

  bot.action("admin:stats", async (ctx) => {
    await ctx.answerCbQuery();
    await sendStats(ctx, services);
  });

  bot.action("admin:alerts", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const alerts = await services.adminService.getAlerts();
    const body = alerts.map((a) => `${severityEmoji(a.severity)} ${a.message}`).join("\n");
    await ctx.reply(`🚨 *System Alerts*\n\n${body}`, { parse_mode: "Markdown", ...backToMenuKeyboard() });
  });

  bot.action("admin:moderation", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const events = services.groupService.getRecentEscalations();
    if (events.length === 0) {
      await ctx.reply("🚨 No group moderation escalations recorded.", backToMenuKeyboard());
      return;
    }
    const lines = events
      .slice(0, 15)
      .map((e) => `${e.action === "ADMIN_ALERT" ? "🔴" : "🟠"} ${e.reason} · chat ${e.chatId} · user ${e.telegramId}`);
    await ctx.reply(`🚨 *Group Moderation*\n\n${lines.join("\n")}`, { parse_mode: "Markdown", ...backToMenuKeyboard() });
  });

  bot.action("admin:supportanalytics", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    await sendSupportAnalytics(ctx, services);
  });

  bot.action("admin:groupsettings", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const groups = services.groupService.listConfiguredGroups();
    if (groups.length === 0) {
      await ctx.reply("⚙️ No Proggaa groups are configured. Set PROGGAA_GROUP_IDS to add one.", backToMenuKeyboard());
      return;
    }
    const rows = groups.map((chatId) => [Markup.button.callback(`Group ${chatId}`, `admin:groupsettings:view:${chatId}`)]);
    rows.push([Markup.button.callback("⬅️ Back to Menu", "menu:home")]);
    await ctx.reply("⚙️ *Group Settings*\n\nPick a group to manage.", { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });

  bot.action(/^admin:groupsettings:view:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    await sendGroupSettingsView(ctx, services, ctx.match[1]);
  });

  bot.action(/^admin:groupsettings:toggle:([^:]+):(welcomeEnabled|faqEnabled|moderationEnabled)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const chatId = ctx.match[1];
    const field = ctx.match[2] as "welcomeEnabled" | "faqEnabled" | "moderationEnabled";
    const current = services.groupService.getSettings(chatId);
    services.groupService.updateSettings(chatId, { [field]: !current[field] });
    logger.audit("group.settings_toggled", { chatId, field, telegramId: ctx.auth.telegramId });
    await sendGroupSettingsView(ctx, services, chatId);
  });

  // Group announcements: same sensitivity tier as course announcements —
  // compose, preview, then require explicit confirmation before it goes out
  // to every configured Proggaa group.
  bot.action("admin:groupannounce", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const groups = services.groupService.listConfiguredGroups();
    if (groups.length === 0) {
      await ctx.reply(
        "📢 No Proggaa groups are configured yet. Set PROGGAA_GROUP_IDS to enable group announcements.",
        backToMenuKeyboard()
      );
      return;
    }

    startWizard(ctx, "groupannounce", "awaiting_message", {});
    await ctx.reply(
      `✍️ Send the announcement message. It will go out to ${groups.length} configured group${groups.length === 1 ? "" : "s"}.`,
      { parse_mode: "Markdown" }
    );
  });

  bot.action("groupannounce:send:confirm", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;

    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "groupannounce" || !wizard.data.message) {
      await ctx.reply("This announcement session expired. Please start again from /admin.");
      return;
    }

    const groups = services.groupService.listConfiguredGroups();
    const text = `📢 *Proggaa Announcement*\n\n${wizard.data.message}`;
    let sent = 0;
    for (const chatId of groups) {
      try {
        await ctx.telegram.sendMessage(chatId, text, { parse_mode: "Markdown" });
        sent += 1;
      } catch (error) {
        logger.warn("group_announcement.send_failed", { chatId, error: String(error) });
      }
    }

    logger.audit("group_announcement.sent_via_bot", {
      telegramId: ctx.auth.telegramId,
      groupCount: groups.length,
      sentCount: sent,
    });
    await ctx.editMessageText(`✅ Sent to ${sent}/${groups.length} configured group${groups.length === 1 ? "" : "s"}.`);
    clearWizard(ctx);
  });

  bot.action("groupannounce:send:cancel", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    clearWizard(ctx);
    await ctx.editMessageText("Cancelled — nothing was sent.");
  });
}

function severityEmoji(severity: AlertSeverity): string {
  if (severity === "critical") return "🔴";
  if (severity === "warning") return "🟠";
  return "🟢";
}

/**
 * Every number here comes straight from listTickets() — nothing is
 * estimated or backfilled. "Avg first response time" is skipped (shown
 * as n/a) for any slice with no resolved-with-a-staff-reply tickets,
 * rather than showing a misleading 0.
 */
async function sendSupportAnalytics(ctx: ProggaaBotContext, services: ServiceContainer) {
  const all = await services.supportService.listTickets();

  if (all.length === 0) {
    await ctx.reply("📊 *Support Analytics*\n\nNo tickets yet.", { parse_mode: "Markdown", ...backToMenuKeyboard() });
    return;
  }

  const open = all.filter((t) => t.status === "WAITING" || t.status === "IN_PROGRESS" || t.status === "ESCALATED");
  const resolved = all.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED");

  const byCategory = new Map<string, number>();
  for (const t of all) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
  const mostCommon = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  const paymentCount = all.filter((t) => t.category === "PAYMENT_PROBLEM" || t.category === "REFUND_PROBLEM").length;
  const examCount = all.filter((t) => t.category === "EXAM_PROBLEM" || t.category === "RESULT_PROBLEM").length;
  const courseCount = all.filter((t) => t.category === "COURSE_ACCESS" || t.category === "VIDEO_PROBLEM").length;

  const firstResponseMs: number[] = [];
  for (const t of all) {
    const firstStaffMsg = t.messages.find((m) => m.author === "STAFF");
    if (firstStaffMsg) {
      firstResponseMs.push(new Date(firstStaffMsg.createdAt).getTime() - new Date(t.createdAt).getTime());
    }
  }
  const avgResponseLabel =
    firstResponseMs.length === 0
      ? "n/a — no replies recorded yet"
      : formatDurationMinutes(firstResponseMs.reduce((a, b) => a + b, 0) / firstResponseMs.length);

  const lines = [
    "📊 *Support Analytics*",
    "",
    `Total tickets: ${all.length}`,
    `Open: ${open.length} · Resolved/Closed: ${resolved.length}`,
    `Avg first response time: ${avgResponseLabel}`,
    mostCommon ? `Most common issue: ${mostCommon[0]} (${mostCommon[1]})` : undefined,
    `Payment-related: ${paymentCount} · Exam-related: ${examCount} · Course-related: ${courseCount}`,
  ].filter((l): l is string => l !== undefined);

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...backToMenuKeyboard() });
}

function formatDurationMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr`;
}

async function sendGroupSettingsView(ctx: ProggaaBotContext, services: ServiceContainer, chatId: string) {
  const settings = services.groupService.getSettings(chatId);
  const lines = [
    `⚙️ *Group ${chatId}*`,
    "",
    `👋 Welcome messages: ${settings.welcomeEnabled ? "ON" : "OFF"}`,
    `❓ FAQ auto-answers: ${settings.faqEnabled ? "ON" : "OFF"}`,
    `🚨 Moderation: ${settings.moderationEnabled ? "ON" : "OFF"}`,
  ];
  if (settings.bannedKeywords.length > 0) {
    lines.push(`🔑 Extra banned keywords: ${settings.bannedKeywords.join(", ")}`);
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback(settings.welcomeEnabled ? "Turn Welcome OFF" : "Turn Welcome ON", `admin:groupsettings:toggle:${chatId}:welcomeEnabled`)],
      [Markup.button.callback(settings.faqEnabled ? "Turn FAQ OFF" : "Turn FAQ ON", `admin:groupsettings:toggle:${chatId}:faqEnabled`)],
      [Markup.button.callback(settings.moderationEnabled ? "Turn Moderation OFF" : "Turn Moderation ON", `admin:groupsettings:toggle:${chatId}:moderationEnabled`)],
      [Markup.button.callback("⬅️ Back to Groups", "admin:groupsettings")],
    ]),
  });
}

/** Called by the central text router when a "groupannounce" wizard is awaiting the message body. */
export async function handleGroupAnnouncementTextInput(ctx: ProggaaBotContext, _services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "groupannounce" || wizard.step !== "awaiting_message") return;

  const validated = validateBoundedText(text, TEXT_LIMITS.announcementMessage);
  if (!validated.ok) {
    await ctx.reply(`Announcement ${validated.error}. Please try again.`);
    return;
  }

  wizard.data.message = validated.value;
  wizard.step = "confirming";

  await ctx.reply(`📢 *Preview*\n\n${validated.value}\n\nSend this to all configured groups?`, {
    parse_mode: "Markdown",
    ...confirmKeyboard("groupannounce:send:confirm", "groupannounce:send:cancel"),
  });
}

export async function sendAdminDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["ADMIN"])) return;

  const stats = await services.adminService.getStatistics();
  const pendingPayments = await services.paymentService.getPendingPayments();

  const lines = [
    "👨‍💼 *Proggaa Admin*",
    "",
    `👥 Users: ${(stats.studentCount + stats.teacherCount).toLocaleString()}`,
    `📚 Courses: ${stats.courseCount.toLocaleString()}`,
    `💰 Pending payments: ${pendingPayments.length}`,
    `📝 Exams: ${stats.examCount.toLocaleString()}`,
    `🔴 Live exams: ${stats.liveExamCount}`,
    "",
    "System status: 🟢 Operational",
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...adminDashboardKeyboard() });
}
