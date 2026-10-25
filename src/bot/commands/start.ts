import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { backToMenuKeyboard, moreKeyboard, startKeyboard } from "../keyboards/mainMenu";
import { clearWizard } from "../handlers/wizard";
import { show } from "../screens";
import { Markup } from "telegraf";
import { DELETION_PENDING, HELP_TEXT, SCHOOL_NUDGE, WELCOME_LINKED, WELCOME_UNLINKED } from "../messages/copy";
import { esc, progressBar } from "../messages/brand";
import { logger } from "../../utils/logger";

export function registerStartCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("start", async (ctx) => {
    clearWizard(ctx);
    ctx.session.awaitingLinkToken = false;
    await sendStartScreen(ctx, services);
  });

  bot.command("help", async (ctx) => {
    await sendHelp(ctx);
  });

  bot.action("menu:help", async (ctx) => {
    await ctx.answerCbQuery();
    await sendHelp(ctx);
  });

  // The "Menu" button used throughout the bot.
  bot.action("menu:home", async (ctx) => {
    await ctx.answerCbQuery();
    clearWizard(ctx);
    await sendStartScreen(ctx, services);
  });

  bot.action("menu:more", async (ctx) => {
    await ctx.answerCbQuery();
    await show(ctx, "➕ *More*", { parse_mode: "Markdown", ...moreKeyboard() });
  });
}

export async function sendStartScreen(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (ctx.auth.deletionPending) {
    await show(ctx, DELETION_PENDING, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.url("Sign in to keep it", services.deepLinkService.login())]]),
    });
    return;
  }

  if (ctx.auth.linked && ctx.auth.proggaaUserId) {
    const userId = ctx.auth.proggaaUserId;
    const [user, home] = await Promise.all([
      services.userService.getUserById(userId),
      // The menu still works if this extra lookup fails.
      services.learningService.getHome(userId).catch((error) => {
        logger.warn("home.lookup_failed", { error: String(error) });
        return null;
      }),
    ]);
    let text = WELCOME_LINKED(user?.name ?? "there");
    if (home?.resume) {
      const r = home.resume;
      text += `\n\n▶️ *Pick up where you left off*\n${esc(r.title)}\n_${esc(r.missionTitle)}_`;
      if (r.watchedPercent > 0) text += `\n${progressBar(r.watchedPercent)} ${r.watchedPercent}%`;
    }
    if (home?.needsSchool) text += `\n\n${SCHOOL_NUDGE}`;
    await show(ctx, text, {
      parse_mode: "Markdown",
      ...startKeyboard(true, ctx.auth.role, home, { completeProfile: services.deepLinkService.completeProfile() }),
    });
    return;
  }

  await show(ctx, WELCOME_UNLINKED, { parse_mode: "Markdown", ...startKeyboard(false) });
}

async function sendHelp(ctx: ProggaaBotContext) {
  await ctx.reply(HELP_TEXT(ctx.auth.linked && ctx.auth.role ? ctx.auth.role : "NONE"), {
    parse_mode: "Markdown",
    ...backToMenuKeyboard(),
  });
}
