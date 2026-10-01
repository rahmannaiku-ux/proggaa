import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { ICON, heading } from "../messages/brand";

export function registerSupportCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("support", async (ctx) => {
    await sendSupport(ctx, services);
  });

  bot.action("menu:support", async (ctx) => {
    await ctx.answerCbQuery();
    await sendSupport(ctx, services);
  });
}

/**
 * Support lives on Proggaa (its Support page and bug reports with screenshots,
 * which the admins work from). The bot does not run a second ticket system:
 * it points people to the real one.
 */
async function sendSupport(ctx: ProggaaBotContext, services: ServiceContainer) {
  const links = services.deepLinkService;
  await ctx.reply(
    [
      heading("🆘", "Support"),
      "",
      "Something not working, or a question about payments, your Missions or an Encounter?",
      "",
      "Open the Support page on Proggaa. You can report a problem there with screenshots, and the Proggaa team reads every report.",
      "",
      `${ICON.payment} Payment questions: open your payment on Proggaa to see where it is.`,
    ].join("\n"),
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.url("🆘 Open Support", links.support())],
        [Markup.button.callback("⬅️ Menu", "menu:home")],
      ]),
    }
  );
}
