import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { validateBoundedText } from "../../utils/validation";
import { ICON, esc, heading } from "../messages/brand";
import { clearWizard, startWizard } from "../handlers/wizard";
import { guarded, show } from "../screens";

/**
 * The "about me" part of the website's profile page: a one-line headline and a short bio.
 * Name, phone, email and student details stay on the website, where they are verified.
 */

const LIMITS = { headline: 150, bio: 2000 } as const;

async function showProfile(ctx: ProggaaBotContext, services: ServiceContainer, userId: string) {
  const p = await services.profileService.getProfile(userId);
  await show(
    ctx,
    [heading("👤", "Your profile"), "", `*Headline:* ${p.headline ? esc(p.headline) : "—"}`, "", `*Bio:* ${p.bio ? esc(p.bio) : "—"}`].join("\n"),
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✏️ Headline", "pf:headline"), Markup.button.callback("✏️ Bio", "pf:bio")],
        [Markup.button.url("Open on Proggaa", services.deepLinkService.profile())],
        [Markup.button.callback("⬅️ Menu", "menu:home")],
      ]),
    }
  );
}

export function registerProfileCommands(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("profile", async (ctx) => {
    await guarded(ctx, null, (userId) => showProfile(ctx, services, userId));
  });
  bot.action("menu:profile", async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, (userId) => showProfile(ctx, services, userId));
  });

  for (const field of ["headline", "bio"] as const) {
    bot.action(`pf:${field}`, async (ctx) => {
      await ctx.answerCbQuery();
      await guarded(ctx, null, async () => {
        startWizard(ctx, "profile", field);
        await ctx.reply(
          field === "headline"
            ? "Send your new *headline* (one line, up to 150 characters), or `-` to remove it."
            : "Send your new *bio* (up to 2000 characters), or `-` to remove it.",
          { parse_mode: "Markdown" }
        );
      });
    });
  }
}

/** Text router entry for the profile's typed steps. */
export async function handleProfileTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "profile") return;
  const field = wizard.step === "bio" ? "bio" : "headline";
  await guarded(ctx, null, async (userId) => {
    let value = "";
    if (text.trim() !== "-") {
      const v = validateBoundedText(text, LIMITS[field]);
      if (!v.ok) return void (await ctx.reply(`Your ${field} ${v.error}. Please try again.`));
      value = v.value;
    }
    clearWizard(ctx);
    await services.profileService.updateProfile(userId, { [field]: value });
    await ctx.reply(`${ICON.done} ${field === "bio" ? "Bio" : "Headline"} ${value ? "saved" : "removed"}.`);
    await showProfile(ctx, services, userId);
  });
}
