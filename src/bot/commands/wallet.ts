import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { ICON, TERMS, formatNumber, heading } from "../messages/brand";

export function registerWalletCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("wallet", async (ctx) => {
    await sendWallet(ctx, services);
  });

  bot.action("menu:wallet", async (ctx) => {
    await ctx.answerCbQuery();
    await sendWallet(ctx, services);
  });
}

/** Proggy Coins are earned and spent on the website; the bot only shows the balance. */
async function sendWallet(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const user = await services.userService.getUserById(ctx.auth.proggaaUserId!);
  if (!user) {
    await ctx.reply("I couldn't find your Proggaa profile. Try /unlink and /link again.");
    return;
  }

  const links = services.deepLinkService;
  await ctx.reply(
    [
      heading(ICON.wallet, TERMS.coins),
      "",
      `${ICON.coins} *${formatNumber(user.coinBalance)}* ${TERMS.coins}`,
      "",
      "Earn them by learning, then spend them in the Proggy Store.",
    ].join("\n"),
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.url(`${ICON.wallet} Open wallet`, links.wallet()), Markup.button.url("🛍️ Proggy Store", links.store())],
        [Markup.button.callback("⬅️ Menu", "menu:home")],
      ]),
    }
  );
}
