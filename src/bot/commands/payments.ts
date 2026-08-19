import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked, requireRole } from "../middleware/guards";
import { formatPaymentCard } from "../messages/formatters";
import { paymentReviewKeyboard } from "../keyboards/cards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { startWizard, clearWizard } from "../handlers/wizard";
import { NotFoundError, ValidationError } from "../../services/proggaa/errors";
import { isValidEntityId, validateBoundedText, TEXT_LIMITS } from "../../utils/validation";
import { logger } from "../../utils/logger";

export function registerPaymentsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("payments", async (ctx) => {
    if (await requireLinked(ctx)) return;
    if (ctx.auth.role === "ADMIN") {
      await sendPendingPayments(ctx, services);
    } else {
      await sendPaymentCenter(ctx, services);
    }
  });

  bot.action("menu:payments", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendPaymentCenter(ctx, services);
  });

  bot.action(/^mypayment:view:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendPaymentDetail(ctx, services, ctx.match[1]);
  });

  bot.action(/^mypayment:txid:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    const paymentId = ctx.match[1];
    const payment = await services.paymentService.getPaymentById(paymentId);
    if (!payment || payment.studentId !== ctx.auth.proggaaUserId) {
      await ctx.reply("That payment couldn't be found.");
      return;
    }
    startWizard(ctx, "paymenttxid", "awaiting_txid", { paymentId });
    await ctx.reply("✍️ Send the Transaction ID (TXID) from your payment.");
  });

  bot.action(/^mypayment:report:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    const paymentId = ctx.match[1];
    const payment = await services.paymentService.getPaymentById(paymentId);
    if (!payment || payment.studentId !== ctx.auth.proggaaUserId) {
      await ctx.reply("That payment couldn't be found.");
      return;
    }
    startWizard(ctx, "support", "awaiting_message", {
      category: "PAYMENT_PROBLEM",
      __paymentContext: JSON.stringify({
        paymentId: payment.id,
        transactionId: payment.transactionId,
        courseId: payment.courseId,
        courseName: payment.courseName,
      }),
    });
    await ctx.reply(
      `📩 *Payment Problem — ${payment.courseName}*\n\nDescribe what's going on. Your payment reference is attached automatically.`,
      { parse_mode: "Markdown" }
    );
  });

  bot.action("mypayment:instructions", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      [
        "💳 *How to Pay*",
        "",
        "Payment instructions (bKash number, amount, steps) come from your Proggaa course checkout page — open the course on the Proggaa website/app to see the exact instructions and amount for that course.",
        "",
        "Once you've paid, come back here and use *Submit TXID* on that payment so we can verify it.",
      ].join("\n"),
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
  });

  // Step 1: tapping Approve/Reject asks for explicit confirmation — it
  // never mutates anything by itself, per the spec's "every sensitive
  // action must require confirmation" requirement.
  bot.action(/^payment:approve:ask:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const paymentId = ctx.match[1];
    if (!isValidEntityId(paymentId)) return ctx.reply("Invalid payment reference.");

    await ctx.reply(`Approve this payment?`, {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Confirm Approve", `payment:approve:confirm:${paymentId}`),
          Markup.button.callback("↩️ Cancel", `payment:cancel:${paymentId}`),
        ],
      ]),
    });
  });

  bot.action(/^payment:reject:ask:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const paymentId = ctx.match[1];
    if (!isValidEntityId(paymentId)) return ctx.reply("Invalid payment reference.");

    await ctx.reply(`Reject this payment?`, {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Confirm Reject", `payment:reject:confirm:${paymentId}`),
          Markup.button.callback("↩️ Cancel", `payment:cancel:${paymentId}`),
        ],
      ]),
    });
  });

  // Step 2: the actual mutating call — only reachable after confirmation,
  // and always routed through ProggaaPaymentService, never a direct
  // database/mock array write from the handler itself.
  bot.action(/^payment:approve:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const paymentId = ctx.match[1];
    if (!isValidEntityId(paymentId)) return ctx.reply("Invalid payment reference.");

    try {
      const payment = await services.paymentService.approvePayment(paymentId, ctx.auth.proggaaUserId!);
      await ctx.editMessageText(`✅ Approved.\n\n${formatPaymentCard(payment)}`, { parse_mode: "Markdown" });
    } catch (error) {
      if (error instanceof NotFoundError) {
        await ctx.editMessageText("This payment no longer exists.");
        return;
      }
      throw error;
    }
  });

  bot.action(/^payment:reject:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const paymentId = ctx.match[1];
    if (!isValidEntityId(paymentId)) return ctx.reply("Invalid payment reference.");

    try {
      const payment = await services.paymentService.rejectPayment(paymentId, ctx.auth.proggaaUserId!);
      await ctx.editMessageText(`❌ Rejected.\n\n${formatPaymentCard(payment)}`, { parse_mode: "Markdown" });
    } catch (error) {
      if (error instanceof NotFoundError) {
        await ctx.editMessageText("This payment no longer exists.");
        return;
      }
      throw error;
    }
  });

  bot.action(/^payment:cancel:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    await ctx.editMessageText("Cancelled — no changes were made.");
  });
}

export async function sendPendingPayments(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["ADMIN"])) return;

  const payments = await services.paymentService.getPendingPayments();
  if (payments.length === 0) {
    await ctx.reply("💰 No pending payments right now.", backToMenuKeyboard());
    return;
  }

  await ctx.reply(`💰 *Pending Payments* (${payments.length})`, { parse_mode: "Markdown" });
  for (const payment of payments) {
    await ctx.reply(formatPaymentCard(payment), {
      parse_mode: "Markdown",
      ...paymentReviewKeyboard(payment, services.deepLinkService),
    });
  }
}

async function sendPaymentCenter(ctx: ProggaaBotContext, services: ServiceContainer) {
  const payments = await services.paymentService.getPaymentsForStudent(ctx.auth.proggaaUserId!);

  const rows = payments.slice(0, 10).map((p) => [
    Markup.button.callback(`${statusEmoji(p.status)} ${p.courseName} · ৳${p.amount}`, `mypayment:view:${p.id}`),
  ]);
  rows.push([Markup.button.callback("💳 How to Pay", "mypayment:instructions")]);
  rows.push([Markup.button.callback("🆘 Payment Support", "support:category:PAYMENT_PROBLEM")]);
  rows.push([Markup.button.callback("⬅️ Back to Menu", "menu:home")]);

  const header =
    payments.length === 0
      ? "💳 *Payment Center*\n\nNo payments on file yet."
      : `💳 *Payment Center*\n\n${payments.length} payment${payments.length === 1 ? "" : "s"}. Tap one for details.`;

  await ctx.reply(header, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
}

async function sendPaymentDetail(ctx: ProggaaBotContext, services: ServiceContainer, paymentId: string) {
  const payment = await services.paymentService.getPaymentById(paymentId);
  if (!payment || payment.studentId !== ctx.auth.proggaaUserId) {
    await ctx.reply("That payment couldn't be found.");
    return;
  }

  const buttons = [];
  if (payment.status === "PENDING") {
    buttons.push([Markup.button.callback("🔢 Submit TXID", `mypayment:txid:${payment.id}`)]);
  }
  buttons.push([Markup.button.callback("🐛 Report a Problem", `mypayment:report:${payment.id}`)]);
  buttons.push([Markup.button.url("🔎 View on website", services.deepLinkService.getPaymentLink(payment.id))]);
  buttons.push([Markup.button.callback("⬅️ Back to Payments", "menu:payments")]);

  await ctx.reply(formatPaymentCard(payment), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
}

function statusEmoji(status: "PENDING" | "APPROVED" | "REJECTED"): string {
  if (status === "APPROVED") return "✅";
  if (status === "REJECTED") return "❌";
  return "🟡";
}

/** Called by the central text router when a "paymenttxid" wizard is awaiting the TXID. */
export async function handlePaymentTxidTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "paymenttxid") return;

  const paymentId = wizard.data.paymentId;
  clearWizard(ctx);

  const validated = validateBoundedText(text, TEXT_LIMITS.transactionId);
  if (!validated.ok) {
    await ctx.reply(`That TXID ${validated.error}. Please try again from the payment.`);
    return;
  }

  try {
    await services.paymentService.submitTransactionId(paymentId, ctx.auth.proggaaUserId!, validated.value);
    logger.audit("payment.txid_submitted_via_bot", { paymentId, telegramId: ctx.auth.telegramId });
    await ctx.reply("✅ TXID submitted. We'll verify it and update your payment status.");
    await sendPaymentDetail(ctx, services, paymentId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      await ctx.reply("That payment couldn't be found.");
      return;
    }
    if (error instanceof ValidationError) {
      await ctx.reply(error.message);
      return;
    }
    throw error;
  }
}
