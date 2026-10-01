import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { ENTITY_ID_PATTERN, TEXT_LIMITS, validateBoundedText } from "../../utils/validation";
import { logger } from "../../utils/logger";
import { MENTOR_ROLES } from "../middleware/guards";
import { ICON, TERMS, esc, heading } from "../messages/brand";
import { confirmKeyboard } from "../keyboards/mainMenu";
import { clearWizard, startWizard } from "../handlers/wizard";
import { guarded, show } from "../screens";

const id = ENTITY_ID_PATTERN;

type Tool = "announce" | "grant" | "medal";

const TOOL_TITLE: Record<Tool, string> = {
  announce: "Announce to a Mission",
  grant: "Grant access to a Mission",
  medal: "Issue a Medal",
};

/**
 * What a Mentor (or admin) can do from Telegram: post an announcement to a Mission, give
 * a Hero access to it, issue a Medal. Each tool picks a Mission, collects what it needs,
 * shows a preview and waits for a confirming tap. Proggaa then checks that the Mentor
 * really teaches that Mission before doing anything, exactly as on the website.
 */
export function registerMentorTools(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  for (const tool of ["announce", "grant", "medal"] as const) {
    bot.action(`tool:${tool}`, async (ctx) => {
      await ctx.answerCbQuery();
      await guarded(ctx, MENTOR_ROLES, async (userId) => {
        const missions = await services.courseService.getCoursesForTeacher(userId);
        if (missions.length === 0) return void (await show(ctx, `You don't teach any ${TERMS.courses} yet.`));
        const rows = missions.slice(0, 12).map((m) => [Markup.button.callback(m.name.slice(0, 60), `toolm:${tool}:${m.id}`)]);
        rows.push([Markup.button.callback("⬅️ Back", "menu:teacher")]);
        await show(ctx, `${heading(ICON.mentor, TOOL_TITLE[tool])}\n\nWhich ${TERMS.course}?`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard(rows),
        });
      });
    });
  }

  bot.action(new RegExp(`^toolm:(announce|grant|medal):(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, MENTOR_ROLES, async (userId) => {
      const tool = ctx.match[1] as Tool;
      const missionId = ctx.match[2]!;
      // Only offer Missions this person teaches; Proggaa checks again when the action runs.
      const missions = await services.courseService.getCoursesForTeacher(userId);
      const mission = missions.find((m) => m.id === missionId);
      if (!mission) return void (await show(ctx, `I couldn't find that ${TERMS.course} among yours.`));

      if (tool === "announce") {
        startWizard(ctx, "tool", "announce_title", { tool, missionId, missionName: mission.name });
        await ctx.reply(`✍️ Announcement for *${esc(mission.name)}*.\n\nSend the *title* (a short line).`, { parse_mode: "Markdown" });
        return;
      }
      startWizard(ctx, "tool", "hero", { tool, missionId, missionName: mission.name });
      await ctx.reply(
        `${tool === "grant" ? "➕ Give access to" : `${ICON.medal} Issue a Medal for`} *${esc(mission.name)}*.\n\nSend the ${TERMS.student.toLowerCase()}'s email or phone number.`,
        { parse_mode: "Markdown" }
      );
    });
  });

  bot.action("tool:confirm", async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, MENTOR_ROLES, async (userId) => {
      const wizard = ctx.session.wizard;
      if (!wizard || wizard.name !== "tool" || wizard.step !== "confirming") {
        return void (await show(ctx, "That session expired. Start again from the Mentor menu."));
      }
      const { tool, missionId = "", missionName = "", title = "", message = "", hero = "" } = wizard.data;
      clearWizard(ctx);

      if (tool === "announce") {
        await services.mentorToolsService.announce(userId, missionId, title, message);
        logger.audit("announcement.sent_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId });
        await show(ctx, `${ICON.done} Announcement sent to everyone enrolled in *${esc(missionName)}*.`, { parse_mode: "Markdown" });
      } else if (tool === "grant") {
        const r = await services.mentorToolsService.grantAccess(userId, missionId, hero);
        logger.audit("access.granted_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId });
        await show(ctx, r.alreadyEnrolled ? `${esc(r.heroLabel)} already had access.` : `${ICON.done} ${esc(r.heroLabel)} can now open *${esc(missionName)}*.`, { parse_mode: "Markdown" });
      } else if (tool === "medal") {
        const r = await services.mentorToolsService.issueMedal(userId, missionId, hero);
        logger.audit("medal.issued_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId });
        await show(ctx, r.alreadyIssued ? `${esc(r.heroLabel)} already has this Medal.` : `${ICON.medal} Medal issued to ${esc(r.heroLabel)}.`, { parse_mode: "Markdown" });
      }
    });
  });

  bot.action("tool:cancel", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    clearWizard(ctx);
    await show(ctx, "Cancelled. Nothing was changed.");
  });
}

/** Text router entry for the Mentor tools' steps. */
export async function handleToolTextInput(ctx: ProggaaBotContext, _services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "tool") return;
  if (!ctx.auth.role || !MENTOR_ROLES.includes(ctx.auth.role)) return clearWizard(ctx);

  if (wizard.step === "announce_title") {
    const v = validateBoundedText(text, TEXT_LIMITS.announcementTitle);
    if (!v.ok) return void (await ctx.reply(`The title ${v.error}. Please try again.`));
    wizard.data.title = v.value;
    wizard.step = "announce_body";
    await ctx.reply("Now send the *message*.", { parse_mode: "Markdown" });
    return;
  }

  if (wizard.step === "announce_body") {
    const v = validateBoundedText(text, TEXT_LIMITS.announcementBody);
    if (!v.ok) return void (await ctx.reply(`The message ${v.error}. Please try again.`));
    wizard.data.message = v.value;
    wizard.step = "confirming";
    await ctx.reply(
      `📢 *Preview for ${esc(wizard.data.missionName ?? "")}*\n\n*${esc(wizard.data.title ?? "")}*\n${esc(v.value)}\n\nEveryone enrolled will be notified. Send it?`,
      { parse_mode: "Markdown", ...confirmKeyboard("tool:confirm", "tool:cancel", "📢 Send") }
    );
    return;
  }

  if (wizard.step === "hero") {
    const v = validateBoundedText(text, TEXT_LIMITS.heroIdentifier);
    if (!v.ok) return void (await ctx.reply(`That ${v.error}. Please try again.`));
    wizard.data.hero = v.value;
    wizard.step = "confirming";
    const grant = wizard.data.tool === "grant";
    await ctx.reply(
      `${grant ? "➕ Give access" : `${ICON.medal} Issue a Medal`}\n\n${TERMS.student}: ${esc(v.value)}\n${TERMS.course}: ${esc(wizard.data.missionName ?? "")}\n\nContinue?`,
      { parse_mode: "Markdown", ...confirmKeyboard("tool:confirm", "tool:cancel", grant ? "➕ Give access" : `${ICON.medal} Issue`) }
    );
  }
}
