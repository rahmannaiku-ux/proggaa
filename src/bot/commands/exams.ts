import type { Telegraf } from "telegraf";
import type { ExamSummary } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { formatExamCard } from "../messages/formatters";
import { examCardKeyboard } from "../keyboards/cards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";

export function registerExamsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("exams", async (ctx) => {
    await sendExams(ctx, services);
  });

  bot.action("menu:exams", async (ctx) => {
    await ctx.answerCbQuery();
    await sendExams(ctx, services);
  });
}

function groupExams(exams: ExamSummary[]) {
  const upcoming = exams.filter((e) => e.status === "SCHEDULED" || e.status === "STARTING_SOON");
  const live = exams.filter((e) => e.status === "LIVE" || e.status === "ENDING_SOON");
  const completed = exams.filter((e) => e.status === "COMPLETED");
  return { upcoming, live, completed };
}

export async function sendExams(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const proggaaUserId = ctx.auth.proggaaUserId!;
  const exams =
    ctx.auth.role === "TEACHER"
      ? await services.examService.getExamsForTeacher(proggaaUserId)
      : await services.examService.getExamsForStudent(proggaaUserId);

  if (exams.length === 0) {
    await ctx.reply("📝 You don't have any exams yet.", backToMenuKeyboard());
    return;
  }

  const { upcoming, live, completed } = groupExams(exams);

  const sendGroup = async (title: string, group: ExamSummary[]) => {
    if (group.length === 0) return;
    await ctx.reply(title, { parse_mode: "Markdown" });
    for (const exam of group) {
      await ctx.reply(formatExamCard(exam), {
        parse_mode: "Markdown",
        ...examCardKeyboard(exam, services.deepLinkService),
      });
    }
  };

  await sendGroup("🔴 *Live*", live);
  await sendGroup("🗓️ *Upcoming*", upcoming);
  await sendGroup("✅ *Completed*", completed);

  await ctx.reply("⬅️", backToMenuKeyboard());
}
