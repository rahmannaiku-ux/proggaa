import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { SupportCategory, SupportTicket, SupportTicketStatus } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { startWizard, clearWizard } from "../handlers/wizard";
import { validateBoundedText, TEXT_LIMITS } from "../../utils/validation";
import { formatDateTime } from "../messages/formatters";
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
  WAITING: "🟡 Waiting for support",
  IN_PROGRESS: "🔵 In progress",
  RESOLVED: "🟢 Resolved",
  ESCALATED: "🔴 Escalated",
  CLOSED: "⚪ Closed",
};

export function registerSupportCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("support", async (ctx) => {
    if (await requireLinked(ctx)) return;
    await sendSupportMenu(ctx);
  });

  bot.action("support:menu", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendSupportMenu(ctx);
  });

  bot.action("support:mytickets", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendMyTickets(ctx, services);
  });

  bot.action(/^support:category:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;

    const category = ctx.match[1] as SupportCategory;
    if (!(category in CATEGORY_LABELS)) {
      await ctx.reply("Unknown support category.");
      return;
    }

    if (category === "VIDEO_PROBLEM") {
      await sendVideoTroubleshooting(ctx);
      return;
    }

    startWizard(ctx, "support", "awaiting_message", { category });
    await ctx.reply(
      `📩 *${CATEGORY_LABELS[category]}*\n\nDescribe what's going on and we'll create a support ticket. Send it as your next message.`,
      { parse_mode: "Markdown" }
    );
  });

  bot.action(/^support:ticket:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendTicketDetail(ctx, services, ctx.match[1]);
  });

  bot.action(/^support:reply:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    const ticketId = ctx.match[1];
    const ticket = await services.supportService.getTicket(ticketId);
    if (!ticket || ticket.userId !== ctx.auth.proggaaUserId) {
      await ctx.reply("That ticket couldn't be found.");
      return;
    }
    startWizard(ctx, "support", "awaiting_reply", { ticketId });
    await ctx.reply(`✏️ Reply to *${ticket.ticketNumber}*\n\nSend your message as your next message.`, {
      parse_mode: "Markdown",
    });
  });

  bot.action(/^support:close:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    const ticketId = ctx.match[1];
    const ticket = await services.supportService.getTicket(ticketId);
    if (!ticket || ticket.userId !== ctx.auth.proggaaUserId) {
      await ctx.reply("That ticket couldn't be found.");
      return;
    }
    await services.supportService.setStatus(ticketId, "CLOSED");
    logger.audit("support.ticket_closed_by_student", { ticketId, telegramId: ctx.auth.telegramId });
    await sendTicketDetail(ctx, services, ticketId);
  });

  bot.action(/^support:reopen:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    const ticketId = ctx.match[1];
    const ticket = await services.supportService.getTicket(ticketId);
    if (!ticket || ticket.userId !== ctx.auth.proggaaUserId) {
      await ctx.reply("That ticket couldn't be found.");
      return;
    }
    await services.supportService.setStatus(ticketId, "WAITING");
    logger.audit("support.ticket_reopened_by_student", { ticketId, telegramId: ctx.auth.telegramId });
    await sendTicketDetail(ctx, services, ticketId);
  });

  bot.action(/^support:video:tryagain$/, async (ctx) => {
    await ctx.answerCbQuery("Hope that fixed it!");
    await sendSupportMenu(ctx);
  });

  bot.action("support:video:report", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    startWizard(ctx, "support", "awaiting_message", { category: "VIDEO_PROBLEM" });
    await ctx.reply(
      "📩 *Video Problem*\n\nWhich course/lesson, and what happens when it fails? Send it as your next message.",
      { parse_mode: "Markdown" }
    );
  });
}

/** Called by the central text router when a "support" wizard is awaiting the ticket message or a reply. */
export async function handleSupportTextInput(ctx: ProggaaBotContext, services: ServiceContainer, message: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "support") return;

  if (wizard.step === "awaiting_reply") {
    const ticketId = wizard.data.ticketId;
    clearWizard(ctx);

    const validated = validateBoundedText(message, TEXT_LIMITS.supportMessage);
    if (!validated.ok) {
      await ctx.reply(`That message ${validated.error}. Please try again from the ticket.`);
      return;
    }

    const ticket = await services.supportService.getTicket(ticketId);
    if (!ticket || ticket.userId !== ctx.auth.proggaaUserId) {
      await ctx.reply("That ticket couldn't be found.");
      return;
    }

    await services.supportService.addMessage(ticketId, "STUDENT", "You", validated.value);
    logger.audit("support.ticket_reply_added", { ticketId, telegramId: ctx.auth.telegramId });
    await sendTicketDetail(ctx, services, ticketId);
    return;
  }

  const category = wizard.data.category as SupportCategory;
  const suppliedContextRaw = wizard.data.__paymentContext;
  const problemLabel = wizard.data.__problemLabel;
  clearWizard(ctx);

  const validated = validateBoundedText(message, TEXT_LIMITS.supportMessage);
  if (!validated.ok) {
    await ctx.reply(`That message ${validated.error}. Please try /support again.`);
    return;
  }

  const ticketMessage = problemLabel ? `[${problemLabel}] ${validated.value}` : validated.value;
  const context = await buildTicketContext(services, category, ctx.auth.proggaaUserId!, suppliedContextRaw);
  const priority = category === "EXAM_PROBLEM" && context?.examId ? "HIGH" : "NORMAL";

  const ticket = await services.supportService.createTicket(
    ctx.auth.proggaaUserId!,
    category,
    ticketMessage,
    { priority, context }
  );
  logger.audit("support.ticket_created_via_bot", {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    telegramId: ctx.auth.telegramId,
  });

  await ctx.reply(
    `✅ Ticket created (*${ticket.ticketNumber}*).\n\nOur team will follow up here. You can check on it anytime from "My Tickets" in Support.`,
    { parse_mode: "Markdown", ...backToMenuKeyboard() }
  );
}

/**
 * Best-effort context so staff don't have to ask the student for basics.
 * Only attaches what's actually available for that category — never
 * fabricated, and never exposes anything beyond ids/titles.
 */
async function buildTicketContext(
  services: ServiceContainer,
  category: SupportCategory,
  proggaaUserId: string,
  suppliedContextRaw?: string
) {
  // If the ticket was opened from the Payment Center or exam emergency
  // flow, the exact reference (paymentId/examId/attemptId) is already
  // known — use that instead of re-deriving it.
  if (suppliedContextRaw) {
    try {
      return JSON.parse(suppliedContextRaw);
    } catch {
      // fall through to best-effort derivation below
    }
  }

  if (category === "EXAM_PROBLEM" || category === "RESULT_PROBLEM") {
    const exams = await services.examService.getExamsForStudent(proggaaUserId);
    const active = exams.find((e) => e.status === "LIVE" || e.status === "STARTING_SOON" || e.status === "ENDING_SOON");
    const mostRecent = active ?? [...exams].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
    if (mostRecent) {
      return {
        examId: mostRecent.id,
        examTitle: mostRecent.title,
        courseId: mostRecent.courseId,
        courseName: mostRecent.courseName,
      };
    }
  }

  return undefined;
}

async function sendVideoTroubleshooting(ctx: ProggaaBotContext) {
  await ctx.reply(
    [
      "🎥 *Video isn't working*",
      "",
      "Try these first:",
      "1️⃣ Check your internet connection",
      "2️⃣ Reload the lesson",
      "3️⃣ Try another browser",
      "4️⃣ Disable VPN/ad-blocker",
      "5️⃣ Try another device",
    ].join("\n"),
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ That fixed it", "support:video:tryagain")],
        [Markup.button.callback("🐛 Still broken — report it", "support:video:report")],
      ]),
    }
  );
}

async function sendSupportMenu(ctx: ProggaaBotContext) {
  const rows = (Object.entries(CATEGORY_LABELS) as [SupportCategory, string][]).map(([category, label]) => [
    Markup.button.callback(label, `support:category:${category}`),
  ]);
  rows.push([Markup.button.callback("🎫 My Tickets", "support:mytickets")]);
  rows.push([Markup.button.callback("⬅️ Back to Menu", "menu:home")]);
  await ctx.reply("🆘 *Support Center*\n\nWhat do you need help with?", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function sendMyTickets(ctx: ProggaaBotContext, services: ServiceContainer) {
  const tickets = await services.supportService.getTicketsForUser(ctx.auth.proggaaUserId!);
  if (tickets.length === 0) {
    await ctx.reply("🎫 You don't have any support tickets yet.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to Support", "support:menu")]]),
    });
    return;
  }

  const rows = tickets
    .slice(0, 10)
    .map((t) => [
      Markup.button.callback(
        `${t.ticketNumber} · ${CATEGORY_LABELS[t.category]} · ${STATUS_LABELS[t.status].split(" ")[0]}`,
        `support:ticket:${t.id}`
      ),
    ]);
  rows.push([Markup.button.callback("⬅️ Back to Support", "support:menu")]);

  await ctx.reply("🎫 *My Tickets*\n\nTap one to view details.", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function sendTicketDetail(ctx: ProggaaBotContext, services: ServiceContainer, ticketId: string) {
  const ticket = await services.supportService.getTicket(ticketId);
  if (!ticket || ticket.userId !== ctx.auth.proggaaUserId) {
    await ctx.reply("That ticket couldn't be found.");
    return;
  }

  const lines = [
    `🎫 *${ticket.ticketNumber}*`,
    `${CATEGORY_LABELS[ticket.category]} · ${STATUS_LABELS[ticket.status]}`,
    ticket.priority === "HIGH" ? "⚠️ High priority" : undefined,
    "",
  ].filter((l): l is string => l !== undefined);

  const recentMessages = ticket.messages.slice(-5);
  for (const m of recentMessages) {
    const who = m.author === "STUDENT" ? "You" : m.authorName;
    lines.push(`*${who}* · ${formatDateTime(m.createdAt)}`);
    lines.push(m.body);
    lines.push("");
  }

  const buttons = [];
  if (ticket.status !== "CLOSED") {
    buttons.push([Markup.button.callback("✏️ Reply", `support:reply:${ticket.id}`)]);
    buttons.push([Markup.button.callback("✅ Close ticket", `support:close:${ticket.id}`)]);
  } else {
    buttons.push([Markup.button.callback("↩️ Reopen ticket", `support:reopen:${ticket.id}`)]);
  }
  buttons.push([Markup.button.callback("⬅️ Back to My Tickets", "support:mytickets")]);

  await ctx.reply(lines.join("\n").trim(), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
}
