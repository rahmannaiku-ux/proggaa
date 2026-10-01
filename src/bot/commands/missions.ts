import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { missionCardKeyboard } from "../keyboards/cards";
import { formatMissionCard } from "../messages/formatters";
import { TERMS, heading, plural } from "../messages/brand";
import { ICON } from "../messages/brand";

const MAX_CARDS = 10;

export function registerMissionsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  // /courses is kept as an alias for people who know the old name.
  bot.command(["missions", "courses"], async (ctx) => {
    await sendMissions(ctx, services);
  });

  bot.action("menu:missions", async (ctx) => {
    await ctx.answerCbQuery();
    await sendMissions(ctx, services);
  });
}

async function sendMissions(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const courses = await services.courseService.getCoursesForStudent(ctx.auth.proggaaUserId!);
  if (courses.length === 0) {
    await ctx.reply(
      `${heading(ICON.mission, `Your ${TERMS.courses}`)}\n\nYou're not enrolled in a ${TERMS.course} yet. Browse them on Proggaa and they'll appear here.`,
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
    return;
  }

  const shown = courses.slice(0, MAX_CARDS);
  await ctx.reply(heading(ICON.mission, `Your ${TERMS.courses} (${courses.length})`), { parse_mode: "Markdown" });
  for (const course of shown) {
    await ctx.reply(formatMissionCard(course), {
      parse_mode: "Markdown",
      ...missionCardKeyboard(course, services.deepLinkService),
    });
  }
  if (courses.length > shown.length) {
    await ctx.reply(`…and ${plural(courses.length - shown.length, TERMS.course)} more on Proggaa.`, backToMenuKeyboard());
  } else {
    await ctx.reply("That's all of them.", backToMenuKeyboard());
  }
}
