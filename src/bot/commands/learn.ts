import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";
import type { PatrolDetail, PatrolListItem } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { ENTITY_ID_PATTERN, TEXT_LIMITS, validateBoundedText } from "../../utils/validation";
import { formatDateTime } from "../messages/formatters";
import { ICON, TERMS, esc, heading, progressBar } from "../messages/brand";
import { clearWizard, startWizard } from "../handlers/wizard";
import { guarded, matchId, show } from "../screens";

const id = ENTITY_ID_PATTERN;
const PAGE_SIZE = 10;

function minutes(seconds: number): string {
  return seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} min` : "";
}

function patrolIcon(p: PatrolListItem): string {
  if (p.locked) return "🔒";
  if (p.completed) return ICON.done;
  if (p.isLive) return ICON.live;
  return "▫️";
}

/**
 * Studying from Telegram: a Mission's Operations, an Operation's Patrols, one Patrol with
 * its resources and notes. The video itself is watched on Proggaa (its protected player
 * is what measures watching, so progress and XP only count there); every Patrol has a
 * button that opens it.
 */
export function registerLearnCommands(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  const links = services.deepLinkService;

  // --- a Mission ---
  bot.action(new RegExp(`^m:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      const mission = await services.learningService.getMission(userId, matchId(ctx));
      if (!mission) return void (await show(ctx, "I couldn't find that Mission."));

      const lines = [
        heading(ICON.mission, mission.title),
        mission.subtitle ? esc(mission.subtitle) : "",
        mission.enrolled ? `${progressBar(mission.progressPercent)} ${mission.progressPercent}%` : `You're not enrolled in this ${TERMS.course} yet.`,
        "",
        ...mission.operations.map((o, i) => `${i + 1}. ${esc(o.title)}  ${ICON.done} ${o.completedCount}/${o.patrolCount}`),
      ].filter((l, i, all) => l !== "" || all[i - 1] !== "");

      const rows: InlineKeyboardButton[][] = mission.operations.slice(0, 20).map((o) => [
        Markup.button.callback(`${o.completedCount === o.patrolCount && o.patrolCount > 0 ? ICON.done : "▫️"} ${o.title}`.slice(0, 60), `o:${o.id}`),
      ]);
      if (mission.resume) rows.unshift([Markup.button.callback(`▶️ Continue: ${mission.resume.title}`.slice(0, 60), `pt:${mission.resume.patrolId}`)]);
      if (!mission.enrolled) rows.unshift([Markup.button.callback("➕ How to join", `cat:m:${mission.id}`)]);
      rows.push([Markup.button.url("🌐 Open on Proggaa", links.mission(mission.id)), Markup.button.callback("⬅️ Missions", "menu:missions")]);

      await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
    });
  });

  // --- an Operation (with paging) ---
  bot.action(new RegExp(`^o:(${id})(?::(\\d{1,2}))?$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      const operationId = matchId(ctx, 1);
      const page = Math.max(0, Number(ctx.match[2] ?? 0) || 0);
      const operation = await services.learningService.getOperation(userId, operationId);
      if (!operation) return void (await show(ctx, "I couldn't find that Operation."));

      const flat = operation.chapters.flatMap((c) => c.classTypes.flatMap((g) => g.patrols.map((p) => ({ chapter: c.title, classType: g.title, patrol: p }))));
      const done = flat.filter((f) => f.patrol.completed).length;
      const slice = flat.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

      const lines = [heading(ICON.mission, operation.title), `${esc(operation.missionTitle)} · ${ICON.done} ${done}/${flat.length} ${TERMS.lesson}s`, ""];
      let lastGroup = "";
      for (const item of slice) {
        const group = `${item.chapter} · ${item.classType}`;
        if (group !== lastGroup) {
          lines.push(`*${esc(group)}*`);
          lastGroup = group;
        }
        lines.push(`${patrolIcon(item.patrol)} ${esc(item.patrol.title)} ${esc(minutes(item.patrol.durationSeconds))}`.trimEnd());
      }
      if (flat.length === 0) lines.push(`No ${TERMS.lesson}s here yet.`);

      const rows: InlineKeyboardButton[][] = slice.map((f) => [Markup.button.callback(`${patrolIcon(f.patrol)} ${f.patrol.title}`.slice(0, 60), `pt:${f.patrol.id}`)]);
      const nav: InlineKeyboardButton[] = [];
      if (page > 0) nav.push(Markup.button.callback("◀️ Previous", `o:${operationId}:${page - 1}`));
      if ((page + 1) * PAGE_SIZE < flat.length) nav.push(Markup.button.callback("Next ▶️", `o:${operationId}:${page + 1}`));
      if (nav.length) rows.push(nav);
      rows.push([Markup.button.callback(`⬅️ ${TERMS.course}`, `m:${operation.missionId}`)]);

      await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
    });
  });

  // --- a Patrol ---
  bot.action(new RegExp(`^pt:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async (userId) => {
      const patrol = await services.learningService.getPatrol(userId, matchId(ctx));
      if (!patrol) return void (await show(ctx, "I couldn't find that Patrol."));
      await showPatrol(ctx, patrol, services);
    });
  });

  // --- a note on a Patrol ---
  bot.action(new RegExp(`^note:(${id})$`), async (ctx) => {
    await ctx.answerCbQuery();
    await guarded(ctx, null, async () => {
      startWizard(ctx, "note", "awaiting_text", { patrolId: matchId(ctx) });
      await ctx.reply("✍️ Send your note for this Patrol. It is saved on Proggaa, in your notes for the Patrol.");
    });
  });
}

async function showPatrol(ctx: ProggaaBotContext, p: PatrolDetail, services: ServiceContainer) {
  const links = services.deepLinkService;
  const lines = [
    heading(p.isLive ? ICON.live : ICON.mission, p.title),
    `${esc(p.missionTitle)} › ${esc(p.operationTitle)}`,
    [minutes(p.durationSeconds), p.completed ? `${ICON.done} Completed` : p.watchedSeconds > 0 ? `${Math.round(p.watchedSeconds / 60)} min watched` : ""].filter(Boolean).join(" · "),
  ];
  if (p.isLive && p.scheduledStart) lines.push(`${ICON.live} Live class: ${formatDateTime(p.scheduledStart)}`);
  if (p.description) lines.push("", esc(p.description.slice(0, 700)));
  if (p.resources.length > 0) {
    lines.push("", `*Resources* (${p.resources.length})`);
    for (const r of p.resources.slice(0, 8)) lines.push(`📎 ${esc(r.title)}`);
    lines.push("_Open the Patrol on Proggaa to view or download them._");
  }
  if (p.notes.length > 0) {
    lines.push("", `*Your notes*`);
    for (const n of p.notes.slice(0, 3)) lines.push(`📝 ${esc(n.content.slice(0, 200))}`);
  }
  lines.push("", `${ICON.clock} The video plays on Proggaa; that is where watching counts toward your progress.`);

  const watch = links.fromPath(p.path) ?? links.mission(p.missionId);
  const nav: InlineKeyboardButton[] = [];
  if (p.previous) nav.push(Markup.button.callback("◀️ Previous", `pt:${p.previous.id}`));
  if (p.next) nav.push(Markup.button.callback("Next ▶️", `pt:${p.next.id}`));
  const rows: InlineKeyboardButton[][] = [[Markup.button.url(`▶️ ${p.isLive ? "Join / watch" : "Watch"} on Proggaa`, watch)], [Markup.button.callback("✍️ Add a note", `note:${p.id}`)]];
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback("⬅️ Operation", `o:${p.operationId}`)]);

  await show(ctx, lines.join("\n"), { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
}

/** Called by the text router when a hero is writing a note on a Patrol. */
export async function handleNoteTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "note" || !ctx.auth.proggaaUserId) return clearWizard(ctx);

  const validated = validateBoundedText(text, TEXT_LIMITS.note);
  if (!validated.ok) {
    await ctx.reply(`Your note ${validated.error}. Please try again.`);
    return;
  }

  const patrolId = wizard.data.patrolId ?? "";
  clearWizard(ctx);
  await services.learningService.addNote(ctx.auth.proggaaUserId, patrolId, validated.value);
  await ctx.reply(
    `${ICON.done} Note saved.`,
    Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to the Patrol", `pt:${patrolId}`)]])
  );
}
