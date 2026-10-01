import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { studentDashboardKeyboard } from "../keyboards/mainMenu";
import { formatDateTime, formatHeroStats, formatLiveClassCard, relativeTime } from "../messages/formatters";
import { ICON, TERMS, esc, heading, progressBar } from "../messages/brand";
import { sendTeacherDashboard } from "./teacher";
import { sendAdminDashboard } from "./admin";

export function registerDashboardCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("dashboard", async (ctx) => {
    await sendDashboard(ctx, services);
  });

  bot.action("menu:dashboard", async (ctx) => {
    await ctx.answerCbQuery();
    await sendDashboard(ctx, services);
  });
}

export async function sendDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  // Each role gets its own home; the role comes from the website, not from the chat.
  if (ctx.auth.role === "TEACHER") return sendTeacherDashboard(ctx, services);
  if (ctx.auth.role === "ADMIN") return sendAdminDashboard(ctx, services);

  await sendHeroDashboard(ctx, services);
}

async function sendHeroDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  const id = ctx.auth.proggaaUserId!;
  const [user, courses, exams, liveClasses] = await Promise.all([
    services.userService.getUserById(id),
    services.courseService.getCoursesForStudent(id),
    services.examService.getExamsForStudent(id),
    services.liveClassService.getLiveClasses(id),
  ]);

  if (!user) {
    await ctx.reply("I couldn't find your Proggaa profile. Try /unlink and /link again.");
    return;
  }

  const lines = [heading("🏠", `Hello, ${user.name}`), "", formatHeroStats(user)];

  const nextLive = liveClasses[0];
  if (nextLive) {
    lines.push("", formatLiveClassCard(nextLive));
  }

  const nextExam = exams
    .filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (nextExam) {
    lines.push(
      "",
      `${ICON.encounter} *Next ${TERMS.exam}:* ${esc(nextExam.title)}`,
      `${formatDateTime(nextExam.startsAt)} (${relativeTime(nextExam.startsAt)})`
    );
  }

  const active = courses.filter((c) => c.progressPercent < 100).slice(0, 3);
  if (active.length > 0) {
    lines.push("", `${ICON.mission} *Keep going*`);
    for (const course of active) lines.push(`${esc(course.name)}\n${progressBar(course.progressPercent, 8)} ${course.progressPercent}%`);
  } else if (courses.length === 0) {
    lines.push("", `You're not enrolled in a ${TERMS.course} yet. Find one on Proggaa and it will show up here.`);
  } else {
    lines.push("", `${ICON.done} Every ${TERMS.course} is complete. Well done, ${TERMS.student.toLowerCase()}!`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...studentDashboardKeyboard() });
}
