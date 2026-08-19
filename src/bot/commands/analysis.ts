import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ExamResult } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { formatDateTime } from "../messages/formatters";

export function registerAnalysisCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("analysis", async (ctx) => {
    await sendAnalysis(ctx, services);
  });

  bot.action("menu:analysis", async (ctx) => {
    await ctx.answerCbQuery();
    await sendAnalysis(ctx, services);
  });
}

async function sendAnalysis(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireLinked(ctx)) return;

  const results = await services.resultService.getResultsForStudent(ctx.auth.proggaaUserId!);

  if (results.length === 0) {
    await ctx.reply(
      "📊 *My Analysis*\n\nNot enough data yet — this fills in once you have published exam results.",
      { parse_mode: "Markdown", ...backKeyboard() }
    );
    return;
  }

  const sorted = [...results].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const avg = Math.round(sorted.reduce((sum, r) => sum + r.percentage, 0) / sorted.length);
  const trend = describeTrend(sorted);

  const lines = [
    "📊 *My Analysis*",
    "",
    `Average score across ${sorted.length} exam${sorted.length === 1 ? "" : "s"}: *${avg}%*`,
    `Trend: ${trend}`,
    "",
    "*Recent exams:*",
    ...[...sorted].reverse().slice(0, 5).map((r) => resultLine(r)),
  ];

  // Per-topic/subject strength breakdown (e.g. "Mechanics 82%, Electricity
  // 64%") needs question-level tagging that isn't in the current result
  // data — ExamResult only has an overall score per exam, not per-topic.
  // Rather than invent numbers, say so plainly.
  lines.push(
    "",
    "ℹ️ Topic-level strengths/weaknesses (e.g. by subject or chapter) aren't available yet — that needs per-question topic data that isn't in your results today."
  );

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", ...backKeyboard() });
}

function resultLine(r: ExamResult): string {
  const emoji = r.percentage >= 75 ? "🟢" : r.percentage >= 50 ? "🟡" : "🔴";
  return `${emoji} ${r.examTitle} — ${r.percentage}% (${r.grade}) · ${formatDateTime(r.publishedAt)}`;
}

function describeTrend(sortedByDateAsc: ExamResult[]): string {
  if (sortedByDateAsc.length < 2) return "Not enough exams yet to show a trend.";
  const recent = sortedByDateAsc.slice(-3);
  const first = recent[0].percentage;
  const last = recent[recent.length - 1].percentage;
  const delta = last - first;
  if (delta > 3) return `📈 Improving (+${delta} pts over your last ${recent.length} exams)`;
  if (delta < -3) return `📉 Dipping (${delta} pts over your last ${recent.length} exams)`;
  return "➡️ Holding steady";
}

function backKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🏆 My Progress", "menu:progress")],
    [Markup.button.callback("⬅️ Back to Menu", "menu:home")],
  ]);
}
