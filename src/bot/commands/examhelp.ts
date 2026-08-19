import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ExamSummary } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { startWizard } from "../handlers/wizard";
import { examStatusLabel } from "../messages/formatters";

const PROBLEM_TYPES: Record<string, string> = {
  technical: "🖥️ Technical Issue",
  answersaving: "💾 Answer-Saving Problem",
  accidentalexit: "🚪 Accidental Exit",
  submission: "📤 Submission Problem",
  connection: "📶 Connection Problem",
};

export function registerExamHelpCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("examhelp", async (ctx) => {
    if (await requireLinked(ctx)) return;
    await sendExamHelp(ctx, services);
  });

  bot.action("menu:examhelp", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendExamHelp(ctx, services);
  });

  bot.action(/^examhelp:report:([^:]+):(technical|answersaving|accidentalexit|submission|connection)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;

    const examId = ctx.match[1];
    const problemKey = ctx.match[2];
    const exam = await services.examService.getExamById(examId);
    if (!exam) {
      await ctx.reply("That exam couldn't be found.");
      return;
    }

    // Goes straight into the same ticket pipeline as everything else — a
    // technical problem reported here is automatically HIGH priority
    // because it carries an examId (see support.ts). Exam content/answers
    // are never touched by this flow, only the exam's id/title/course.
    startWizard(ctx, "support", "awaiting_message", {
      category: "EXAM_PROBLEM",
      __problemLabel: PROBLEM_TYPES[problemKey],
      __paymentContext: JSON.stringify({
        examId: exam.id,
        examTitle: exam.title,
        courseId: exam.courseId,
        courseName: exam.courseName,
      }),
    });

    await ctx.reply(
      `🚨 *${PROBLEM_TYPES[problemKey]} — ${exam.title}*\n\nDescribe exactly what happened (what you were doing, what you saw). This creates a high-priority ticket right away.`,
      { parse_mode: "Markdown" }
    );
  });
}

async function sendExamHelp(ctx: ProggaaBotContext, services: ServiceContainer) {
  const exams = await services.examService.getExamsForStudent(ctx.auth.proggaaUserId!);

  const active = exams.filter((e) => e.status === "LIVE" || e.status === "STARTING_SOON" || e.status === "ENDING_SOON");
  const recentCompleted = exams
    .filter((e) => e.status === "COMPLETED")
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 1);

  const relevant = active.length > 0 ? active : recentCompleted;

  if (relevant.length === 0) {
    await ctx.reply(
      "📝 *Exam Help*\n\nNo active or recent exams found. If you're having trouble with an exam, open Support instead.",
      { parse_mode: "Markdown", ...backToMenuKeyboard() }
    );
    return;
  }

  for (const exam of relevant) {
    const lines = [`📝 *${exam.title}*`, `${exam.courseName} · ${examStatusLabel(exam.status)}`];
    if (exam.status === "LIVE") {
      lines.push(remainingTimeLine(exam));
    }
    lines.push("", "Report a problem:");

    const rows = (Object.entries(PROBLEM_TYPES) as [string, string][]).map(([key, label]) => [
      Markup.button.callback(label, `examhelp:report:${exam.id}:${key}`),
    ]);

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  }

  await ctx.reply("⬅️", backToMenuKeyboard());
}

function remainingTimeLine(exam: ExamSummary): string {
  const startsAtMs = new Date(exam.startsAt).getTime();
  const endsAtMs = startsAtMs + exam.durationMinutes * 60_000;
  const remainingMinutes = Math.max(0, Math.round((endsAtMs - Date.now()) / 60_000));
  return `⏳ Time remaining: ~${remainingMinutes} min`;
}
