import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { Payment } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked, requireRole } from "../middleware/guards";
import { backToMenuKeyboard, confirmKeyboard } from "../keyboards/mainMenu";
import { paymentReviewKeyboard } from "../keyboards/cards";
import { formatPaymentCard } from "../messages/formatters";
import { ICON, esc, formatTaka, heading } from "../messages/brand";
import { startWizard, clearWizard } from "../handlers/wizard";
import { NotFoundError } from "../../services/proggaa/errors";
import { ENTITY_ID_PATTERN, TEXT_LIMITS, isValidEntityId, validateBoundedText } from "../../utils/validation";
import { logger } from "../../utils/logger";

const id = ENTITY_ID_PATTERN;

export function registerPaymentsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("payments", async (ctx) => {
    if (await requireLinked(ctx)) return;
    if (ctx.auth.role === "ADMIN") await sendPendingPayments(ctx, services);
    else await sendMyPayments(ctx, services);
  });

  bot.action("menu:payments", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendMyPayments(ctx, services);
  });

  bot.action(new RegExp(`^mypayment:view:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendMyPayment(ctx, services, ctx.match[1]!);
  });

  // --- admin: approve or reject, always with a confirmation step ---
  // Tapping Approve or Reject never changes anything by itself.

  bot.action(new RegExp(`^payment:approve:ask:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    await ctx.reply("Approve this payment? The hero will be enrolled right away.", confirmKeyboard(`payment:approve:confirm:${ctx.match[1]}`, "payment:cancel", "✅ Approve"));
  });

  bot.action(new RegExp(`^payment:approve:confirm:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const paymentId = ctx.match[1]!;
    try {
      const payment = await services.paymentService.approvePayment(ctx.auth.proggaaUserId!, paymentId);
      logger.audit("payment.approved_via_bot", { paymentId, telegramId: ctx.auth.telegramId, proggaaUserId: ctx.auth.proggaaUserId });
      await ctx.editMessageText(`${ICON.done} Approved.\n\n${formatPaymentCard(payment, { showStudent: true })}`, { parse_mode: "Markdown" });
    } catch (error) {
      if (error instanceof NotFoundError) {
        await ctx.editMessageText("This payment no longer exists.");
        return;
      }
      throw error;
    }
  });

  // Rejecting asks for a reason first: the hero sees it on Proggaa.
  bot.action(new RegExp(`^payment:reject:ask:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    startWizard(ctx, "paymentreject", "awaiting_reason", { paymentId: ctx.match[1]! });
    await ctx.reply("✍️ Send the reason for rejecting this payment. The hero will see it.");
  });

  bot.action(new RegExp(`^payment:reject:confirm:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const paymentId = ctx.match[1]!;
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "paymentreject" || wizard.data.paymentId !== paymentId || !wizard.data.reason) {
      await ctx.reply("That session expired. Start again from /payments.");
      return;
    }
    const reason = wizard.data.reason;
    clearWizard(ctx);

    try {
      const payment = await services.paymentService.rejectPayment(ctx.auth.proggaaUserId!, paymentId, reason);
      logger.audit("payment.rejected_via_bot", { paymentId, telegramId: ctx.auth.telegramId, proggaaUserId: ctx.auth.proggaaUserId });
      await ctx.editMessageText(`${ICON.danger} Rejected.\n\n${formatPaymentCard(payment, { showStudent: true })}`, { parse_mode: "Markdown" });
    } catch (error) {
      if (error instanceof NotFoundError) {
        await ctx.editMessageText("This payment no longer exists.");
        return;
      }
      throw error;
    }
  });

  bot.action("payment:cancel", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    clearWizard(ctx);
    await ctx.editMessageText("Cancelled. Nothing was changed.");
  });
}

/** Called by the text router when an admin is writing a rejection reason. */
export async function handleRejectReasonTextInput(ctx: ProggaaBotContext, _services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "paymentreject" || wizard.step !== "awaiting_reason") return;
  if (await requireRole(ctx, ["ADMIN"])) {
    clearWizard(ctx);
    return;
  }

  const validated = validateBoundedText(text, TEXT_LIMITS.rejectReason);
  if (!validated.ok) {
    await ctx.reply(`The reason ${validated.error}. Please try again.`);
    return;
  }
  if (!isValidEntityId(wizard.data.paymentId ?? "")) {
    clearWizard(ctx);
    return;
  }

  wizard.data.reason = validated.value;
  wizard.step = "confirming";
  await ctx.reply(`❌ *Reject this payment?*\n\nReason shown to the hero:\n_${esc(validated.value)}_`, {
    parse_mode: "Markdown",
    ...confirmKeyboard(`payment:reject:confirm:${wizard.data.paymentId}`, "payment:cancel", "❌ Reject"),
  });
}

/** Admin queue: payments whose Transaction ID was submitted and wait for verification. */
export async function sendPendingPayments(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["ADMIN"])) return;

  const payments = await services.paymentService.getPendingPayments(ctx.auth.proggaaUserId!);
  if (payments.length === 0) {
    await ctx.reply(`${ICON.payment} No payments are waiting for verification.`, backToMenuKeyboard());
    return;
  }

  await ctx.reply(heading(ICON.payment, `Waiting for verification (${payments.length})`), { parse_mode: "Markdown" });
  for (const payment of payments.slice(0, 10)) {
    await ctx.reply(formatPaymentCard(payment, { showStudent: true }), {
      parse_mode: "Markdown",
      ...paymentReviewKeyboard(payment, services.deepLinkService),
    });
  }
}

async function sendMyPayments(ctx: ProggaaBotContext, services: ServiceContainer) {
  const payments = await services.paymentService.getPaymentsForStudent(ctx.auth.proggaaUserId!);
  const rows = payments
    .slice(0, 10)
    .map((p) => [Markup.button.callback(`${statusIcon(p)} ${p.courseName || "Payment"} · ${formatTaka(p.amount)}`, `mypayment:view:${p.id}`)]);
  rows.push([Markup.button.callback("⬅️ Menu", "menu:home")]);

  await ctx.reply(
    payments.length === 0
      ? `${heading(ICON.payment, "Your payments")}\n\nNo payments yet. Buy a Mission on Proggaa and it shows up here.`
      : `${heading(ICON.payment, "Your payments")}\n\nTap one for details.`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }
  );
}

async function sendMyPayment(ctx: ProggaaBotContext, services: ServiceContainer, paymentId: string) {
  const payment = await services.paymentService.getPayment(ctx.auth.proggaaUserId!, paymentId);
  // The website only returns a payment to its owner (or an admin); this also guards the bot side.
  if (!payment || payment.studentId !== ctx.auth.proggaaUserId) {
    await ctx.reply("I couldn't find that payment.");
    return;
  }

  await ctx.reply(formatPaymentCard(payment), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.url(payment.status === "PENDING" ? "Open payment to send your TXID" : "Open payment on Proggaa", services.deepLinkService.payment(payment.id))],
      [Markup.button.callback("⬅️ Payments", "menu:payments")],
    ]),
  });
}

function statusIcon(payment: Payment): string {
  if (payment.status === "APPROVED") return ICON.done;
  if (payment.status === "REJECTED") return ICON.danger;
  return "🟡";
}
