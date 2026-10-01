import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { ENTITY_ID_PATTERN } from "../../utils/validation";
import { logger } from "../../utils/logger";
import { ICON, TERMS, esc, formatNumber, heading } from "../messages/brand";
import { guarded, matchId, show } from "../screens";
import { ValidationError } from "../../services/proggaa/errors";

const id = ENTITY_ID_PATTERN;

const TYPE_LABEL: Record<string, string> = { PDF: "📄 PDF", EXCLUSIVE_CLASS: "🎬 Exclusive class", STICKER: "🎨 Sticker" };

/**
 * The Proggy Store. Prices, ownership and the purchase itself are Proggaa's; spending
 * coins always needs a second, confirming tap.
 */
export function registerStoreCommands(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("store", async (ctx) => {
    await sendStore(ctx, services);
  });
  bot.action("menu:store", async (ctx) => {
    await ctx.answerCbQuery();
    await sendStore(ctx, services);
  });

  bot.action(new RegExp(`^st:i:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      const store = await services.storeService.getStore(userId);
      const item = store.items.find((i) => i.id === matchId(ctx));
      if (!item) return void (await show(ctx, "That item isn't available any more."));

      const lines = [
        heading("🛍️", item.title),
        TYPE_LABEL[item.type] ?? item.type,
        "",
        esc(item.description.slice(0, 600)),
        "",
        `${ICON.coins} ${formatNumber(item.priceCoins)} ${TERMS.coins}   ·   You have ${formatNumber(store.coinBalance)}`,
      ];
      const rows: InlineKeyboardButton[][] = [];
      if (item.owned) rows.push([Markup.button.url("📂 Open on Proggaa", services.deepLinkService.store())]);
      else if (store.coinBalance >= item.priceCoins) rows.push([Markup.button.callback(`🪙 Buy for ${formatNumber(item.priceCoins)}`, `st:buy:${item.id}`)]);
      else lines.push("", `You need ${formatNumber(item.priceCoins - store.coinBalance)} more ${TERMS.coins}. Keep learning to earn them.`);
      rows.push([Markup.button.callback("⬅️ Store", "menu:store")]);

      await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
    });
  });

  // Step 1 only asks; nothing is spent until the confirming tap.
  bot.action(new RegExp(`^st:buy:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      const store = await services.storeService.getStore(userId);
      const item = store.items.find((i) => i.id === matchId(ctx));
      if (!item || item.owned) return void (await show(ctx, "That item isn't available to buy."));
      await show(ctx, `Spend *${formatNumber(item.priceCoins)} ${TERMS.coins}* on *${esc(item.title)}*?`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("✅ Yes, buy it", `st:ok:${item.id}`), Markup.button.callback("↩️ Cancel", `st:i:${item.id}`)]]),
      });
    });
  });

  bot.action(new RegExp(`^st:ok:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      try {
        const { itemTitle } = await services.storeService.purchase(userId, matchId(ctx));
        logger.audit("store.purchased_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, itemId: matchId(ctx) });
        await show(ctx, `${ICON.done} *${esc(itemTitle)}* is yours!`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.url("📂 Open on Proggaa", services.deepLinkService.store())],
            [Markup.button.callback("⬅️ Store", "menu:store")],
          ]),
        });
      } catch (error) {
        // "Not enough coins", "already yours", "no longer available": Proggaa's own wording.
        if (error instanceof ValidationError) {
          await show(ctx, `⚠️ ${error.message}`, { ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Store", "menu:store")]]) });
          return;
        }
        throw error;
      }
    });
  });
}

async function sendStore(ctx: ProggaaBotContext, services: ServiceContainer) {
  await guarded(ctx, null, async (userId) => {
    const store = await services.storeService.getStore(userId);
    const lines = [heading("🛍️", "Proggy Store"), `${ICON.coins} You have *${formatNumber(store.coinBalance)}* ${TERMS.coins}`, ""];
    if (store.items.length === 0) lines.push("The store is empty right now. Check back soon.");
    for (const item of store.items.slice(0, 12)) {
      lines.push(`${item.owned ? ICON.done : ICON.coins} *${esc(item.title)}*  ${item.owned ? "(yours)" : formatNumber(item.priceCoins)}`);
    }
    const rows: InlineKeyboardButton[][] = store.items
      .slice(0, 12)
      .map((i) => [Markup.button.callback(`${i.owned ? ICON.done : ICON.coins} ${i.title}`.slice(0, 60), `st:i:${i.id}`)]);
    rows.push([Markup.button.callback("⬅️ Menu", "menu:home")]);
    await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });
}
