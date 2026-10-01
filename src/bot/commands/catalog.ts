import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { CatalogMission, CheckoutInstructions } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { ENTITY_ID_PATTERN, TEXT_LIMITS, validateBoundedText } from "../../utils/validation";
import { logger } from "../../utils/logger";
import { ICON, TERMS, esc, formatTaka, heading } from "../messages/brand";
import { clearWizard, startWizard } from "../handlers/wizard";
import { guarded, matchId, show } from "../screens";

const id = ENTITY_ID_PATTERN;

function priceLabel(m: CatalogMission): string {
  if (m.isFree) return "Free";
  return m.finalPrice < m.price ? `${formatTaka(m.finalPrice)} (was ${formatTaka(m.price)})` : formatTaka(m.price);
}

function providerLabel(provider?: string): string {
  if (!provider) return "bKash";
  const names: Record<string, string> = { BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket", UPAY: "Upay" };
  return names[provider] ?? provider;
}

/** What to do next to pay, as a message the hero can follow step by step. */
export function formatCheckout(c: CheckoutInstructions): string {
  if (c.fullyDiscounted) {
    return [
      heading(ICON.payment, c.missionTitle),
      "",
      `${ICON.done} Your coupon${c.couponCode ? ` \`${c.couponCode}\`` : ""} covered the whole price. Proggaa is unlocking this ${TERMS.course} for you now.`,
    ].join("\n");
  }
  const provider = providerLabel(c.provider);
  return [
    heading(ICON.payment, `Pay for ${c.missionTitle}`),
    "",
    `Amount to send: *${formatTaka(c.amount)}*`,
    c.receivingNumber ? `${provider} number: \`${c.receivingNumber}\`` : `${provider} number: shown on the payment page on Proggaa`,
    `Reference: \`${c.reference}\``,
    c.couponCode ? `Coupon: \`${c.couponCode}\`` : "",
    "",
    `1. Open ${provider} and choose *Send Money*.`,
    "2. Send exactly that amount to that number.",
    "3. Copy the Transaction ID (TrxID) from the confirmation message.",
    "4. Tap the button below and send me the Transaction ID.",
    "",
    "An admin (or Proggaa's payment device) checks it, and you'll get a message when the Mission unlocks.",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

function checkoutKeyboard(c: CheckoutInstructions, services: ServiceContainer) {
  if (c.fullyDiscounted) return Markup.inlineKeyboard([[Markup.button.callback("⬅️ Menu", "menu:home")]]);
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ I've paid: send my Transaction ID", `pay:txid:${c.paymentId}`)],
    [Markup.button.url("🌐 Open payment on Proggaa", services.deepLinkService.payment(c.paymentId))],
    [Markup.button.callback("⬅️ Menu", "menu:home")],
  ]);
}

/**
 * Finding, joining and paying for Missions from Telegram. Everything that matters (the
 * price, coupons, whether you are already in, the payment itself) is decided by Proggaa
 * through the same code the website uses; the bot only asks and shows the answer.
 */
export function registerCatalogCommands(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command(["browse", "catalog"], async (ctx) => {
    ctx.session.catalogQuery = undefined;
    await sendCatalog(ctx, services, 1);
  });

  bot.action("menu:browse", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.catalogQuery = undefined;
    await sendCatalog(ctx, services, 1);
  });

  bot.command("search", async (ctx) => {
    const text = ctx.message.text.replace(/^\/search(@\w+)?\s*/i, "");
    if (!text.trim()) {
      startWizard(ctx, "search", "awaiting_text");
      await ctx.reply("🔎 What are you looking for? Send a word from the Mission name.");
      return;
    }
    await runSearch(ctx, services, text);
  });

  bot.action("cat:search", async (ctx) => {
    await ctx.answerCbQuery();
    startWizard(ctx, "search", "awaiting_text");
    await ctx.reply("🔎 What are you looking for? Send a word from the Mission name.");
  });

  bot.action(/^cat:p:(\d{1,2})$/, async (ctx) => {
    await ctx.answerCbQuery();
    await sendCatalog(ctx, services, Number(ctx.match[1]));
  });

  // --- one Mission ---
  bot.action(new RegExp(`^cat:m:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      const mission = await services.catalogService.getMission(userId, matchId(ctx));
      if (!mission) return void (await show(ctx, "I couldn't find that Mission."));

      const lines = [
        heading(ICON.mission, mission.title),
        mission.subtitle ? esc(mission.subtitle) : "",
        "",
        `${priceLabel(mission)} · ${mission.level.toLowerCase().replace("_", " ")} · ${esc(mission.mentorName)}`,
        mission.durationMinutes > 0 ? `About ${Math.round(mission.durationMinutes / 60) || 1} h of ${TERMS.lesson}s` : "",
        "",
        esc(mission.description.slice(0, 700)),
      ].filter((l, i, all) => l !== "" || all[i - 1] !== "");

      const rows: InlineKeyboardButton[][] = [];
      if (mission.enrolled) rows.push([Markup.button.callback("📖 Open Mission", `m:${mission.id}`)]);
      else if (mission.isFree) rows.push([Markup.button.callback("➕ Join for free", `cat:enroll:${mission.id}`)]);
      else if (mission.openPayment) rows.push([Markup.button.callback("💳 Continue my payment", `cat:go:${mission.id}`)]);
      else rows.push([Markup.button.callback(`🛒 Buy for ${formatTaka(mission.finalPrice)}`, `cat:buy:${mission.id}`)]);
      rows.push([Markup.button.url("🌐 Open on Proggaa", services.deepLinkService.mission(mission.id)), Markup.button.callback("⬅️ Browse", "menu:browse")]);

      await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
    });
  });

  bot.action(new RegExp(`^cat:enroll:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      const missionId = matchId(ctx);
      await services.catalogService.enrollFree(userId, missionId);
      logger.audit("mission.enrolled_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId });
      await show(ctx, `${ICON.done} You're in! The ${TERMS.course} is on your list now.`, {
        ...Markup.inlineKeyboard([[Markup.button.callback("📖 Open Mission", `m:${missionId}`)]]),
      });
    });
  });

  // --- buying ---
  bot.action(new RegExp(`^cat:buy:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async () => {
      const missionId = matchId(ctx);
      startWizard(ctx, "coupon", "awaiting_coupon", { missionId });
      await show(ctx, "🎟️ Do you have a coupon code? Send it now, or continue without one.", {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("Continue without a coupon", `cat:go:${missionId}`)],
          [Markup.button.callback("⬅️ Back", `cat:m:${missionId}`)],
        ]),
      });
    });
  });

  bot.action(new RegExp(`^cat:go:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    clearWizard(ctx);
    await guarded(ctx, null, async (userId) => {
      await startCheckout(ctx, services, userId, matchId(ctx));
    });
  });

  // --- sending the Transaction ID ---
  bot.action(new RegExp(`^pay:txid:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async () => {
      startWizard(ctx, "txid", "awaiting_txid", { paymentId: matchId(ctx) });
      await ctx.reply("✍️ Send the Transaction ID (TrxID) from your payment confirmation.");
    });
  });
}

async function startCheckout(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string, coupon?: string) {
  const checkout = await services.catalogService.checkout(userId, missionId, coupon);
  logger.audit("payment.started_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId, paymentId: checkout.paymentId });
  await show(ctx, formatCheckout(checkout), { parse_mode: "Markdown", ...checkoutKeyboard(checkout, services) });
}

async function sendCatalog(ctx: ProggaaBotContext, services: ServiceContainer, page: number) {
  await guarded(ctx, null, async (userId) => {
    const query = ctx.session.catalogQuery;
    const result = await services.catalogService.browse(userId, { query, page });

    const lines = [heading(ICON.mission, query ? `Search: ${query}` : `Browse ${TERMS.courses}`), ""];
    if (result.missions.length === 0) lines.push(query ? "Nothing matched. Try another word." : `No ${TERMS.courses} are published yet.`);
    for (const m of result.missions) lines.push(`${m.enrolled ? ICON.done : "▫️"} *${esc(m.title)}*\n   ${priceLabel(m)} · ${esc(m.mentorName)}`);

    const rows: InlineKeyboardButton[][] = result.missions.map((m) => [
      Markup.button.callback(`${m.enrolled ? ICON.done : "▫️"} ${m.title}`.slice(0, 60), `cat:m:${m.id}`),
    ]);
    const nav: InlineKeyboardButton[] = [];
    if (result.page > 1) nav.push(Markup.button.callback("◀️ Previous", `cat:p:${result.page - 1}`));
    if (result.page * result.pageSize < result.total) nav.push(Markup.button.callback("Next ▶️", `cat:p:${result.page + 1}`));
    if (nav.length) rows.push(nav);
    rows.push([Markup.button.callback("🔎 Search", "cat:search"), Markup.button.callback("⬅️ Menu", "menu:home")]);

    await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });
}

async function runSearch(ctx: ProggaaBotContext, services: ServiceContainer, raw: string) {
  const validated = validateBoundedText(raw, TEXT_LIMITS.searchQuery);
  if (!validated.ok) {
    await ctx.reply(`Your search ${validated.error}. Please try again.`);
    return;
  }
  ctx.session.catalogQuery = validated.value;
  await sendCatalog(ctx, services, 1);
}

/** Text router entry: a search term. */
export async function handleSearchTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  clearWizard(ctx);
  await runSearch(ctx, services, text);
}

/** Text router entry: a coupon code for a Mission about to be bought. */
export async function handleCouponTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "coupon" || !ctx.auth.proggaaUserId) return clearWizard(ctx);

  const validated = validateBoundedText(text, TEXT_LIMITS.couponCode);
  if (!validated.ok) {
    await ctx.reply(`That coupon ${validated.error}. Send it again, or continue without one.`);
    return;
  }
  const missionId = wizard.data.missionId ?? "";
  clearWizard(ctx);
  await guarded(ctx, null, (userId) => startCheckout(ctx, services, userId, missionId, validated.value));
}

/** Text router entry: the Transaction ID of a payment. */
export async function handleTxidTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "txid" || !ctx.auth.proggaaUserId) return clearWizard(ctx);

  const txid = text.trim().toUpperCase();
  // The same shape Proggaa accepts: letters and digits, 6 to 20 of them.
  if (!/^[A-Z0-9]{6,20}$/.test(txid)) {
    await ctx.reply("A Transaction ID is 6 to 20 letters and numbers, with no spaces. Please send it again.");
    return;
  }

  const paymentId = wizard.data.paymentId ?? "";
  clearWizard(ctx);
  await guarded(ctx, null, async (userId) => {
    await services.catalogService.submitTransactionId(userId, paymentId, txid);
    logger.audit("payment.txid_submitted_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, paymentId });
    await ctx.reply(`${ICON.done} Got it. Your payment is waiting for verification, and I'll message you when it's done.`, {
      ...Markup.inlineKeyboard([[Markup.button.callback("💳 My payments", "menu:payments"), Markup.button.callback("⬅️ Menu", "menu:home")]]),
    });
  });
}
