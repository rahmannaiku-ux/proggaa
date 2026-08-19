import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { formatDateTime, examStatusLabel } from "../messages/formatters";

export function registerStudyPlanCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("studyplan", async (ctx) => {
    await sendStudyPlan(ctx, services);
  });

  bot.action("menu:studyplan", async (ctx) => {
    await ctx.answerCbQuery();
    await sendStudyPlan(ctx, services);
  });
}

async function sendStudyPlan(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const proggaaUserId = ctx.auth.proggaaUserId!;
  const [courses, exams] = await Promise.all([
    services.courseService.getCoursesForStudent(proggaaUserId),
    services.examService.getExamsForStudent(proggaaUserId),
  ]);

  const upcomingExams = exams
    .filter((e) => e.status === "SCHEDULED" || e.status === "STARTING_SOON" || e.status === "LIVE")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const inProgressCourses = courses.filter((c) => c.progressPercent < 100);

  const lines = ["📅 *Study Plan*", ""];

  if (upcomingExams.length > 0) {
    lines.push("*Upcoming exams:*");
    for (const e of upcomingExams.slice(0, 5)) {
      lines.push(`📝 ${e.title} (${e.courseName}) — ${examStatusLabel(e.status)} · ${formatDateTime(e.startsAt)}`);
    }
    lines.push("");
  }

  if (inProgressCourses.length > 0) {
    lines.push("*Continue where you left off:*");
    for (const c of inProgressCourses.slice(0, 5)) {
      const next = c.nextLessonTitle ? ` — next: ${c.nextLessonTitle}` : "";
      lines.push(`📚 ${c.name} (${c.progressPercent}% done)${next}`);
    }
    lines.push("");
  }

  if (upcomingExams.length === 0 && inProgressCourses.length === 0) {
    lines.push("Nothing scheduled right now — you're all caught up! 🎉");
  } else {
    lines.push("Suggested focus: revise for your nearest exam first, then continue your in-progress courses.");
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🧠 Study Assistant", "menu:study")],
      [Markup.button.callback("📝 My Exams", "menu:exams")],
      [Markup.button.callback("⬅️ Back to Menu", "menu:home")],
    ]),
  });
}
