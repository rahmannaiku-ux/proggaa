import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { encounterCardKeyboard } from "../keyboards/cards";
import { formatEncounterCard } from "../messages/formatters";
import { ICON, TERMS, heading } from "../messages/brand";

const MAX_CARDS = 8;

export function registerExamsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("exams", async (ctx) => {
    await sendEncounters(ctx, services);
  });

  bot.action("menu:exams", async (ctx) => {
    await ctx.answerCbQuery();
    await sendEncounters(ctx, services);
  });
}

async function sendEncounters(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const exams = await services.examService.getExamsForStudent(ctx.auth.proggaaUserId!);
  const open = exams
    .filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const done = exams
    .filter((e) => e.status === "COMPLETED")
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 3);

  if (open.length === 0 && done.length === 0) {
    await ctx.reply(
      `${heading(ICON.encounter, `Your ${TERMS.exams}`)}\n\nNo ${TERMS.exams} yet. They appear here once a ${TERMS.teacher.toLowerCase()} schedules one in your ${TERMS.courses}.`,
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
    return;
  }

  await ctx.reply(heading(ICON.encounter, `Your ${TERMS.exams}`), { parse_mode: "Markdown" });
  for (const exam of open.slice(0, MAX_CARDS)) {
    await ctx.reply(formatEncounterCard(exam), {
      parse_mode: "Markdown",
      ...encounterCardKeyboard(exam, services.deepLinkService),
    });
  }
  if (done.length > 0) {
    await ctx.reply("*Recently finished*", { parse_mode: "Markdown" });
    for (const exam of done) {
      await ctx.reply(formatEncounterCard(exam), {
        parse_mode: "Markdown",
        ...encounterCardKeyboard(exam, services.deepLinkService),
      });
    }
  }
  await ctx.reply("Open an Encounter on Proggaa to take it.", backToMenuKeyboard());
}
