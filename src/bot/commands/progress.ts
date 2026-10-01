import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ExamResult } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { examStatusLabel, formatDateTime, formatHeroStats, relativeTime } from "../messages/formatters";
import { ICON, TERMS, esc, heading, plural, progressBar } from "../messages/brand";

export function registerProgressCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("progress", async (ctx) => {
    await sendProgress(ctx, services);
  });
  bot.action("menu:progress", async (ctx) => {
    await ctx.answerCbQuery();
    await sendProgress(ctx, services);
  });

  bot.command(["studyplan", "next"], async (ctx) => {
    await sendWhatsNext(ctx, services);
  });
  bot.action("menu:studyplan", async (ctx) => {
    await ctx.answerCbQuery();
    await sendWhatsNext(ctx, services);
  });
}

/** Level, XP, Proggy Coins and streak, each Mission's progress and how recent results are trending. */
async function sendProgress(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const id = ctx.auth.proggaaUserId!;
  const [user, courses, achievements, results] = await Promise.all([
    services.userService.getUserById(id),
    services.courseService.getCoursesForStudent(id),
    services.achievementService.getAchievementsForUser(id),
    ctx.auth.role === "STUDENT" ? services.resultService.getResultsForStudent(id) : Promise.resolve([] as ExamResult[]),
  ]);

  if (!user) {
    await ctx.reply("I couldn't find your Proggaa profile. Try /unlink and /link again.");
    return;
  }

  const lines = [heading("📈", "Your progress"), "", formatHeroStats(user), `${ICON.achievement} ${plural(achievements.length, "achievement")} unlocked`];

  if (courses.length > 0) {
    lines.push("", `*${TERMS.courses}*`);
    for (const course of courses) lines.push(`${esc(course.name)}\n${progressBar(course.progressPercent, 8)} ${course.progressPercent}%`);
  }

  if (results.length > 0) {
    const sorted = [...results].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    const average = Math.round(sorted.reduce((sum, r) => sum + r.percentage, 0) / sorted.length);
    lines.push("", `${ICON.result} *Results:* ${average}% average over ${plural(sorted.length, TERMS.exam)} · ${trend(sorted)}`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...backToMenuKeyboard() });
}

function trend(sortedAscending: ExamResult[]): string {
  if (sortedAscending.length < 2) return "not enough yet for a trend";
  const recent = sortedAscending.slice(-3);
  const change = recent[recent.length - 1]!.percentage - recent[0]!.percentage;
  if (change >= 5) return "📈 improving";
  if (change <= -5) return "📉 slipping";
  return "➡️ steady";
}

/** A short, honest to-do list built only from what Proggaa already knows. */
async function sendWhatsNext(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const id = ctx.auth.proggaaUserId!;
  const [courses, exams, liveClasses] = await Promise.all([
    services.courseService.getCoursesForStudent(id),
    services.examService.getExamsForStudent(id),
    services.liveClassService.getLiveClasses(id),
  ]);

  const upcoming = exams
    .filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 4);
  const inProgress = courses.filter((c) => c.progressPercent < 100).slice(0, 4);

  const lines = [heading("🗓️", "What's next"), ""];

  if (liveClasses.length > 0) {
    lines.push(`*${ICON.live} Live classes*`);
    for (const l of liveClasses.slice(0, 3)) {
      lines.push(`${esc(l.title)} · ${l.status === "LIVE" ? "live now" : `${formatDateTime(l.startsAt)} (${relativeTime(l.startsAt)})`}`);
    }
    lines.push("");
  }
  if (upcoming.length > 0) {
    lines.push(`*${ICON.encounter} ${TERMS.exams}*`);
    for (const e of upcoming) lines.push(`${esc(e.title)} · ${examStatusLabel(e.status)} · ${formatDateTime(e.startsAt)}`);
    lines.push("");
  }
  if (inProgress.length > 0) {
    lines.push(`*${ICON.mission} Keep going*`);
    for (const c of inProgress) lines.push(`${esc(c.name)} · ${c.progressPercent}% done`);
    lines.push("");
  }

  if (lines.length === 2) lines.push(`${ICON.done} Nothing waiting for you. You're all caught up!`);

  await ctx.reply(lines.join("\n").trimEnd(), {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback(`${ICON.encounter} ${TERMS.exams}`, "menu:exams"), Markup.button.callback(`${ICON.mission} ${TERMS.courses}`, "menu:missions")],
      [Markup.button.callback("⬅️ Menu", "menu:home")],
    ]),
  });
}
