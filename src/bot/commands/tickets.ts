import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type {
  ProggaaRole,
  SupportCategory,
  SupportTicket,
  SupportTicketStatus,
} from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { startWizard, clearWizard } from "../handlers/wizard";
import { validateBoundedText, TEXT_LIMITS } from "../../utils/validation";
import { formatDateTime } from "../messages/formatters";
import { supportTicketReplied } from "../../services/notifications/notificationBuilders";
import { logger } from "../../utils/logger";

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  PAYMENT_PROBLEM: "💳 Payment Problem",
  COURSE_ACCESS: "📚 Course Access",
  VIDEO_PROBLEM: "🎥 Video Problem",
  EXAM_PROBLEM: "📝 Exam Problem",
  RESULT_PROBLEM: "📊 Result Problem",
  ACCOUNT_PROBLEM: "👤 Account/Login Problem",
  CERTIFICATE_PROBLEM: "🎓 Certificate Problem",
  REFUND_PROBLEM: "💰 Refund/Payment Reversal",
  BUG_REPORT: "🐛 Report a Bug",
  OTHER: "❓ Other",
};

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  WAITING: "🟡 Waiting",
  IN_PROGRESS: "🔵 In progress",
  RESOLVED: "🟢 Resolved",
  ESCALATED: "🔴 Escalated",
  CLOSED: "⚪ Closed",
};

// Payment/refund/account/certificate tickets touch billing or account
// security — teachers only ever see the categories that are actually
// theirs to resolve (spec 20: "Do not expose payment/admin-sensitive
// information to unauthorized teachers"). Admins see everything.
const TEACHER_VISIBLE_CATEGORIES = new Set<SupportCategory>([
  "COURSE_ACCESS",
  "VIDEO_PROBLEM",
  "EXAM_PROBLEM",
  "RESULT_PROBLEM",
  "BUG_REPORT",
  "OTHER",
]);

function visibleCategories(role: ProggaaRole): Set<SupportCategory> | null {
  return role === "ADMIN" ? null : TEACHER_VISIBLE_CATEGORIES;
}

function canAccess(role: ProggaaRole, ticket: SupportTicket): boolean {
  const visible = visibleCategories(role);
  return visible === null || visible.has(ticket.category);
}

export function registerStaffTicketActions(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.action("teacher:tickets", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    await sendQueue(ctx, services, { status: "WAITING" });
  });

  bot.action("admin:support", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    await sendQueue(ctx, services, {});
  });

  bot.action(/^staffticket:queue:(all|waiting|highpriority|payment|unassigned)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;

    const filterKey = ctx.match[1];
    if (filterKey === "all") return sendQueue(ctx, services, {});
    if (filterKey === "waiting") return sendQueue(ctx, services, { status: "WAITING" });
    if (filterKey === "highpriority") return sendQueue(ctx, services, { priority: "HIGH" });
    if (filterKey === "unassigned") return sendQueue(ctx, services, { unassignedOnly: true });
    if (filterKey === "payment") return sendQueue(ctx, services, { category: "PAYMENT_PROBLEM" });
  });

  bot.action(/^staffticket:view:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    await sendTicketDetail(ctx, services, ctx.match[1]);
  });

  bot.action(/^staffticket:assign:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    const ticketId = ctx.match[1];
    const ticket = await services.supportService.getTicket(ticketId);
    if (!ticket || !canAccess(ctx.auth.role!, ticket)) {
      await ctx.reply("That ticket couldn't be found.");
      return;
    }
    const staffName = await resolveStaffName(ctx, services);
    await services.supportService.assignTicket(ticketId, ctx.auth.proggaaUserId!, staffName);
    logger.audit("support.ticket_assigned_via_bot", { ticketId, staffId: ctx.auth.proggaaUserId });
    await sendTicketDetail(ctx, services, ticketId);
  });

  bot.action(/^staffticket:reply:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    const ticketId = ctx.match[1];
    const ticket = await services.supportService.getTicket(ticketId);
    if (!ticket || !canAccess(ctx.auth.role!, ticket)) {
      await ctx.reply("That ticket couldn't be found.");
      return;
    }
    startWizard(ctx, "staffreply", "awaiting_reply", { ticketId });
    await ctx.reply(`✏️ Reply to *${ticket.ticketNumber}*\n\nSend your reply as your next message.`, {
      parse_mode: "Markdown",
    });
  });

  bot.action(/^staffticket:status:(.+):(RESOLVED|ESCALATED|CLOSED)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    const ticketId = ctx.match[1];
    const status = ctx.match[2] as SupportTicketStatus;
    const ticket = await services.supportService.getTicket(ticketId);
    if (!ticket || !canAccess(ctx.auth.role!, ticket)) {
      await ctx.reply("That ticket couldn't be found.");
      return;
    }
    await services.supportService.setStatus(ticketId, status);
    logger.audit("support.ticket_status_changed_via_bot", { ticketId, status, staffId: ctx.auth.proggaaUserId });
    await sendTicketDetail(ctx, services, ticketId);
  });
}

/** Called by the central text router when a "staffreply" wizard is awaiting the reply body. */
export async function handleStaffReplyTextInput(ctx: ProggaaBotContext, services: ServiceContainer, message: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "staffreply") return;

  const ticketId = wizard.data.ticketId;
  clearWizard(ctx);

  const validated = validateBoundedText(message, TEXT_LIMITS.supportMessage);
  if (!validated.ok) {
    await ctx.reply(`That message ${validated.error}. Please try again from the ticket.`);
    return;
  }

  const ticket = await services.supportService.getTicket(ticketId);
  if (!ticket || !canAccess(ctx.auth.role!, ticket)) {
    await ctx.reply("That ticket couldn't be found.");
    return;
  }

  const staffName = await resolveStaffName(ctx, services);
  const updated = await services.supportService.addMessage(ticketId, "STAFF", staffName, validated.value);
  await services.notificationService.dispatch(
    supportTicketReplied(updated.userId, updated.ticketNumber, updated.id)
  );
  logger.audit("support.ticket_staff_reply_added", { ticketId, staffId: ctx.auth.proggaaUserId });

  await sendTicketDetail(ctx, services, ticketId);
}

async function resolveStaffName(ctx: ProggaaBotContext, services: ServiceContainer): Promise<string> {
  const user = ctx.auth.proggaaUserId ? await services.userService.getUserById(ctx.auth.proggaaUserId) : null;
  return user?.name ?? ctx.from?.first_name ?? "Support";
}

async function sendQueue(
  ctx: ProggaaBotContext,
  services: ServiceContainer,
  filter: { status?: SupportTicketStatus; priority?: "HIGH" | "NORMAL"; category?: SupportCategory; unassignedOnly?: boolean }
) {
  const role = ctx.auth.role!;
  const allTickets = await services.supportService.listTickets({
    status: filter.status,
    priority: filter.priority,
    category: filter.category,
  });
  const visible = visibleCategories(role);
  const scoped = allTickets
    .filter((t) => visible === null || visible.has(t.category))
    .filter((t) => !filter.unassignedOnly || !t.assignedToUserId);

  const rows = scoped.slice(0, 12).map((t) => [
    Markup.button.callback(
      `${t.priority === "HIGH" ? "⚠️ " : ""}${t.ticketNumber} · ${CATEGORY_LABELS[t.category]} · ${STATUS_LABELS[t.status]}`,
      `staffticket:view:${t.id}`
    ),
  ]);

  if (role === "ADMIN") {
    rows.push([
      Markup.button.callback("🟡 Waiting", "staffticket:queue:waiting"),
      Markup.button.callback("⚠️ High priority", "staffticket:queue:highpriority"),
    ]);
    rows.push([
      Markup.button.callback("💳 Payment", "staffticket:queue:payment"),
      Markup.button.callback("❔ Unassigned", "staffticket:queue:unassigned"),
    ]);
    rows.push([Markup.button.callback("📋 All", "staffticket:queue:all")]);
    rows.push([Markup.button.callback("📊 Analytics", "admin:supportanalytics")]);
  }
  rows.push([Markup.button.callback("⬅️ Back to Menu", "menu:home")]);

  const header = role === "ADMIN" ? "🎫 *Support Center*" : "🎫 *Student Tickets*";
  const body = scoped.length === 0 ? "\nNo tickets match this view." : `\n${scoped.length} ticket${scoped.length === 1 ? "" : "s"}. Tap one to open it.`;

  await ctx.reply([header, body].join(""), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function sendTicketDetail(ctx: ProggaaBotContext, services: ServiceContainer, ticketId: string) {
  const role = ctx.auth.role!;
  const ticket = await services.supportService.getTicket(ticketId);
  if (!ticket || !canAccess(role, ticket)) {
    await ctx.reply("That ticket couldn't be found.");
    return;
  }

  const lines = [
    `🎫 *${ticket.ticketNumber}*`,
    `${CATEGORY_LABELS[ticket.category]} · ${STATUS_LABELS[ticket.status]}`,
    ticket.priority === "HIGH" ? "⚠️ High priority" : undefined,
    ticket.assignedToName ? `Assigned to: ${ticket.assignedToName}` : "Unassigned",
  ].filter((l): l is string => l !== undefined);

  if (ticket.context) {
    const ctxLines = Object.entries(ticket.context)
      .filter(([, v]) => v)
      .map(([k, v]) => `• ${k}: ${v}`);
    if (ctxLines.length > 0) {
      lines.push("", "*Context:*", ...ctxLines);
    }
  }

  lines.push("");
  for (const m of ticket.messages.slice(-5)) {
    const who = m.author === "STUDENT" ? "Student" : m.authorName;
    lines.push(`*${who}* · ${formatDateTime(m.createdAt)}`);
    lines.push(m.body);
    lines.push("");
  }

  const buttons = [];
  if (!ticket.assignedToUserId) {
    buttons.push([Markup.button.callback("🙋 Assign to me", `staffticket:assign:${ticket.id}`)]);
  }
  if (ticket.status !== "CLOSED") {
    buttons.push([Markup.button.callback("✏️ Reply", `staffticket:reply:${ticket.id}`)]);
    buttons.push([
      Markup.button.callback("🟢 Resolve", `staffticket:status:${ticket.id}:RESOLVED`),
      Markup.button.callback("🔴 Escalate", `staffticket:status:${ticket.id}:ESCALATED`),
    ]);
    buttons.push([Markup.button.callback("✅ Close", `staffticket:status:${ticket.id}:CLOSED`)]);
  }
  buttons.push([Markup.button.callback("⬅️ Back to Queue", role === "ADMIN" ? "admin:support" : "teacher:tickets")]);

  await ctx.reply(lines.join("\n").trim(), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
}
