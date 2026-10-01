import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { CalendarEntry } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { bstDateKey, bstDayDiff, formatBstDate, formatBstTime } from "../../utils/time";
import { formatBstDateTime } from "../../utils/time";
import { ICON, TERMS, esc, formatNumber, heading } from "../messages/brand";
import { guarded, show } from "../screens";

const KIND_ICON: Record<CalendarEntry["kind"], string> = { event: "📌", live_class: ICON.live, assignment_due: "📝" };

function dayHeading(iso: string): string {
  const diff = bstDayDiff(new Date(), iso);
  const label = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : "";
  return `*${label ? `${label}, ` : ""}${formatBstDate(iso)}*`;
}

/** Calendar, leaderboard, Medals and announcements: Proggaa's own, read-only views. */
export function registerSocialCommands(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  const back = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Menu", "menu:home")]]);

  bot.command("calendar", async (ctx) => sendCalendar(ctx, services));
  bot.action("menu:calendar", async (ctx) => {
    await ctx.answerCbQuery();
    await sendCalendar(ctx, services);
  });

  bot.command("leaderboard", async (ctx) => sendLeaderboard(ctx, services));
  bot.action("menu:leaderboard", async (ctx) => {
    await ctx.answerCbQuery();
    await sendLeaderboard(ctx, services);
  });

  bot.command("medals", async (ctx) => sendMedals(ctx, services));
  bot.action("menu:medals", async (ctx) => {
    await ctx.answerCbQuery();
    await sendMedals(ctx, services);
  });

  bot.command("announcements", async (ctx) => sendAnnouncements(ctx, services, back));
  bot.action("menu:announcements", async (ctx) => {
    await ctx.answerCbQuery();
    await sendAnnouncements(ctx, services, back);
  });
}

async function sendCalendar(ctx: ProggaaBotContext, services: ServiceContainer) {
  await guarded(ctx, null, async (userId) => {
    const items = await services.communityService.getCalendar(userId);
    const lines = [heading("🗓️", "Your calendar"), "All times are Bangladesh time (BST).", ""];
    if (items.length === 0) lines.push("Nothing is coming up. Live classes, events and deadlines will show here.");

    let lastDay = "";
    for (const item of items) {
      const day = bstDateKey(item.startsAt);
      if (day !== lastDay) {
        if (lastDay) lines.push("");
        lines.push(dayHeading(item.startsAt));
        lastDay = day;
      }
      const when = item.kind === "assignment_due" ? `due ${formatBstTime(item.startsAt)}` : formatBstTime(item.startsAt);
      lines.push(`${KIND_ICON[item.kind]} ${when} · ${esc(item.title)}${item.missionTitle ? ` _(${esc(item.missionTitle)})_` : ""}`);
    }

    const rows: InlineKeyboardButton[][] = [
      [Markup.button.url("🌐 Open calendar", services.deepLinkService.fromPath("/calendar") ?? services.deepLinkService.dashboard())],
      [Markup.button.callback("⬅️ Menu", "menu:home")],
    ];
    await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });
}

async function sendLeaderboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  await guarded(ctx, null, async (userId) => {
    const board = await services.communityService.getLeaderboard(userId);
    const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`);
    const lines = [
      heading(ICON.achievement, "Leaderboard"),
      board.schedule === "NEVER" ? "All-time XP" : `XP this ${board.schedule.toLowerCase().replace("ly", "")}`,
      "",
    ];
    if (board.top.length === 0) lines.push("No XP has been earned yet. Be the first!");
    for (const row of board.top) {
      const mine = row.userId === userId ? " ← you" : "";
      lines.push(`${medal(row.rank)} ${esc(row.name)}  ${ICON.xp} ${formatNumber(row.xp)}  ${ICON.level}${row.level}${mine}`);
    }
    if (board.me && !board.top.some((r) => r.userId === userId)) {
      lines.push("…", `${board.me.rank}. You  ${ICON.xp} ${formatNumber(board.me.xp)}  ${ICON.level}${board.me.level}`);
    }

    await show(ctx, lines.join("\n"), {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.url("🌐 Full board", services.deepLinkService.leaderboard())],
        [Markup.button.callback("⬅️ Menu", "menu:home")],
      ]),
    });
  });
}

async function sendMedals(ctx: ProggaaBotContext, services: ServiceContainer) {
  await guarded(ctx, null, async (userId) => {
    const medals = await services.communityService.getMedals(userId);
    const lines = [heading(ICON.medal, "Your Medals"), ""];
    if (medals.length === 0) lines.push(`None yet. Finish a ${TERMS.course} to earn your first Medal.`);
    for (const m of medals) lines.push(`${ICON.medal} *${esc(m.missionTitle)}*${m.issuedAt ? `\n   ${formatBstDateTime(m.issuedAt)}` : ""}`);

    const rows: InlineKeyboardButton[][] = medals
      .slice(0, 6)
      .map((m) => [Markup.button.url(`🔗 Verify: ${m.missionTitle}`.slice(0, 60), services.deepLinkService.fromPath(m.verifyPath) ?? services.deepLinkService.dashboard())]);
    rows.push([Markup.button.callback("⬅️ Menu", "menu:home")]);
    await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });
}

async function sendAnnouncements(ctx: ProggaaBotContext, services: ServiceContainer, back: ReturnType<typeof Markup.inlineKeyboard>) {
  await guarded(ctx, null, async (userId) => {
    const items = await services.communityService.getAnnouncements(userId);
    const lines = [heading("📢", "Announcements"), ""];
    if (items.length === 0) lines.push("No announcements right now.");
    for (const a of items) {
      lines.push(`*${esc(a.title)}*${a.missionTitle ? ` _(${esc(a.missionTitle)})_` : ""}\n${esc(a.body.slice(0, 400))}\n_${formatBstDateTime(a.createdAt)}_`, "");
    }
    await show(ctx, lines.join("\n").trimEnd(), { parse_mode: "Markdown", ...back });
  });
}
