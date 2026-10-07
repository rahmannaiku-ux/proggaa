import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/typings/core/types/typegram";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import type {
  BuilderChange,
  BuilderChapter,
  BuilderClassType,
  BuilderImageTarget,
  BuilderMission,
  BuilderOperation,
  BuilderPatrol,
  MissionLevel,
} from "../../types/editing";
import { ENTITY_ID_PATTERN, validateBoundedText } from "../../utils/validation";
import { formatBstDateTime, parseBstDateTimeInput } from "../../utils/time";
import { logger } from "../../utils/logger";
import { MENTOR_ROLES } from "../middleware/guards";
import { ICON, TERMS, esc, formatTaka, heading, plural } from "../messages/brand";
import { confirmKeyboard } from "../keyboards/mainMenu";
import { clearWizard, startWizard } from "../handlers/wizard";
import { guarded, show } from "../screens";

/**
 * The Mission editor: what a Mentor does in the website's Mission builder, from the
 * chat. Details (title, subtitle, description, price, level), pictures (send a photo),
 * publishing, the Encounters switch, and the whole outline (Operations, chapters, class
 * types, Patrols and live classes: add, rename, delete, edit).
 *
 * Every change is sent to Proggaa, which checks that this person may manage the Mission
 * (main Mentor, co-Mentor or admin) with the same code as the website. Deleting,
 * publishing and removing pictures always ask for a confirming tap first.
 */

const id = ENTITY_ID_PATTERN;
const MAX_LIST = 20;
/** The website refuses request bodies much over 4 MB; Telegram's photos are far smaller. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const LEVELS: Record<string, { level: MissionLevel; label: string }> = {
  B: { level: "BEGINNER", label: "Beginner" },
  I: { level: "INTERMEDIATE", label: "Intermediate" },
  A: { level: "ADVANCED", label: "Advanced" },
  L: { level: "ALL_LEVELS", label: "All levels" },
};
const levelLabel = (level: MissionLevel) => Object.values(LEVELS).find((l) => l.level === level)?.label ?? level;

const STATUS_LABEL = { DRAFT: "📝 Draft", PUBLISHED: "🟢 Published", ARCHIVED: "🗄️ Archived" } as const;

type Kind = "o" | "c" | "g" | "p";
const KIND_NAME: Record<Kind, string> = { o: TERMS.module, c: "chapter", g: "class type", p: TERMS.lesson };
const BULK_KIND = { o: "modules", c: "chapters", g: "groups", p: "lessons" } as const;

const btn = (text: string, data: string) => Markup.button.callback(text, data);

// ---------------------------------------------------------------------
// Finding things inside a Mission's outline
// ---------------------------------------------------------------------

interface Found {
  operation?: BuilderOperation;
  chapter?: BuilderChapter;
  classType?: BuilderClassType;
  patrol?: BuilderPatrol;
}

export function locate(mission: BuilderMission, itemId: string): Found {
  for (const operation of mission.operations) {
    if (operation.id === itemId) return { operation };
    for (const chapter of operation.chapters) {
      if (chapter.id === itemId) return { operation, chapter };
      for (const classType of chapter.classTypes) {
        if (classType.id === itemId) return { operation, chapter, classType };
        for (const patrol of classType.patrols) {
          if (patrol.id === itemId) return { operation, chapter, classType, patrol };
        }
      }
    }
  }
  return {};
}

function counts(mission: BuilderMission) {
  let patrols = 0;
  for (const o of mission.operations) for (const c of o.chapters) for (const g of c.classTypes) patrols += g.patrols.length;
  return { operations: mission.operations.length, patrols };
}

function priceLine(mission: BuilderMission): string {
  if (mission.isFree) return "Free";
  const d = mission.discount;
  if (!d) return formatTaka(mission.priceTaka);
  const off = d.percentOff !== null ? `${d.percentOff}% off` : `${formatTaka(d.amountOffTaka ?? 0)} off`;
  return `${formatTaka(mission.priceTaka)} (${off}${d.isActive ? "" : ", paused"})`;
}

async function loadMission(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string) {
  const mission = await services.builderService.getMission(userId, missionId);
  if (!mission) await show(ctx, `I couldn't find that ${TERMS.course}. It may have been deleted.`);
  return mission;
}

// ---------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------

async function showMissionList(ctx: ProggaaBotContext, services: ServiceContainer, userId: string) {
  const missions = await services.courseService.getCoursesForTeacher(userId);
  const rows: InlineKeyboardButton[][] = missions.slice(0, MAX_LIST).map((m) => [btn(m.name.slice(0, 60), `ed:m:${m.id}`)]);
  rows.push([btn(`➕ New ${TERMS.course}`, "ed:new")]);
  rows.push([btn("⬅️ Back", "menu:teacher")]);
  await show(ctx, `${heading("✏️", `Edit a ${TERMS.course}`)}\n\n${missions.length ? `Which ${TERMS.course}?` : `You don't have any ${TERMS.courses} yet.`}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

export async function showMission(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string) {
  const m = await loadMission(ctx, services, userId, missionId);
  if (!m) return;
  const c = counts(m);
  const text = [
    heading("✏️", m.title),
    "",
    `Status: ${STATUS_LABEL[m.status]}`,
    `Price: ${esc(priceLine(m))}`,
    `Level: ${levelLabel(m.level)}${m.categoryName ? ` · ${esc(m.categoryName)}` : ""}`,
    m.subtitle ? `Subtitle: ${esc(m.subtitle)}` : "Subtitle: —",
    `Thumbnail: ${m.hasThumbnail ? ICON.done : "none"} · Class routine: ${m.hasRoutineImage ? ICON.done : "none"}`,
    `${TERMS.exams}: ${m.examsEnabled ? "on" : "off"}`,
    `Content: ${plural(c.operations, TERMS.module)} · ${plural(c.patrols, TERMS.lesson)}`,
    `${TERMS.student}es enrolled: ${m.enrollmentCount}`,
  ].join("\n");

  const rows: InlineKeyboardButton[][] = [
    [btn("✏️ Title", `ed:f:${m.id}:title`), btn("✏️ Subtitle", `ed:f:${m.id}:sub`)],
    [btn("📝 Description", `ed:f:${m.id}:desc`), btn("📶 Level", `ed:lv:${m.id}`)],
    [m.isFree ? btn("💳 Make it paid", `ed:f:${m.id}:price`) : btn("💰 Price", `ed:f:${m.id}:price`)],
  ];
  if (!m.isFree) rows[2]!.push(btn("🆓 Make it free", `ed:free:${m.id}`));
  rows.push([btn(`🖼️ ${m.hasThumbnail ? "Change" : "Add"} thumbnail`, `ed:img:${m.id}:t`), btn(`🗓️ ${m.hasRoutineImage ? "Change" : "Add"} routine`, `ed:img:${m.id}:r`)]);
  const removals: InlineKeyboardButton[] = [];
  if (m.hasThumbnail) removals.push(btn("🗑️ Remove thumbnail", `ed:imx:${m.id}:t`));
  if (m.hasRoutineImage) removals.push(btn("🗑️ Remove routine", `ed:imx:${m.id}:r`));
  if (removals.length) rows.push(removals);
  rows.push([btn(`📚 Content (${TERMS.module}s, ${TERMS.lesson}s)`, `ed:c:${m.id}`)]);
  rows.push([
    m.status === "PUBLISHED" ? btn("⏸️ Unpublish", `ed:pub:${m.id}:0`) : btn("🚀 Publish", `ed:pub:${m.id}:1`),
    btn(`${ICON.encounter} ${TERMS.exams} ${m.examsEnabled ? "off" : "on"}`, `ed:ex:${m.id}:${m.examsEnabled ? 0 : 1}`),
  ]);
  rows.push([Markup.button.url("🌐 Open the builder", services.deepLinkService.mentorMission(m.id))]);
  rows.push([btn("⬅️ All Missions", "ed:home")]);
  await show(ctx, text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
}

async function showContent(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string) {
  const m = await loadMission(ctx, services, userId, missionId);
  if (!m) return;
  const rows: InlineKeyboardButton[][] = m.operations.slice(0, MAX_LIST).map((o) => [btn(`🧭 ${o.title}`.slice(0, 60), `ed:o:${m.id}:${o.id}`)]);
  rows.push([btn(`➕ Add ${TERMS.module}(s)`, `ed:a:o:${m.id}:${m.id}`)]);
  rows.push([btn("⬅️ Back", `ed:m:${m.id}`)]);
  await show(ctx, `${heading("📚", m.title)}\n\n${m.operations.length ? `${TERMS.module}s:` : `No ${TERMS.module}s yet. Add the first one.`}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

function itemControls(kind: Exclude<Kind, "p">, missionId: string, itemId: string): InlineKeyboardButton[] {
  return [btn("✏️ Rename", `ed:rn:${kind}:${missionId}:${itemId}`), btn("🗑️ Delete", `ed:dl:${kind}:${missionId}:${itemId}`)];
}

async function showOperation(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string, operationId: string) {
  const m = await loadMission(ctx, services, userId, missionId);
  if (!m) return;
  const { operation } = locate(m, operationId);
  if (!operation) return void (await showContent(ctx, services, userId, missionId));
  const rows: InlineKeyboardButton[][] = operation.chapters.slice(0, MAX_LIST).map((c) => [btn(`📖 ${c.title}`.slice(0, 60), `ed:ch:${m.id}:${c.id}`)]);
  rows.push([btn("➕ Add chapter(s)", `ed:a:c:${m.id}:${operation.id}`)]);
  rows.push(itemControls("o", m.id, operation.id));
  rows.push([btn("⬅️ Back", `ed:c:${m.id}`)]);
  await show(ctx, `${heading("🧭", operation.title)}\n${TERMS.module} in ${esc(m.title)}\n\n${operation.chapters.length ? "Chapters:" : "No chapters yet."}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function showChapter(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string, chapterId: string) {
  const m = await loadMission(ctx, services, userId, missionId);
  if (!m) return;
  const { operation, chapter } = locate(m, chapterId);
  if (!operation || !chapter) return void (await showContent(ctx, services, userId, missionId));
  const rows: InlineKeyboardButton[][] = chapter.classTypes.slice(0, MAX_LIST).map((g) => [btn(`🗂️ ${g.title}`.slice(0, 60), `ed:g:${m.id}:${g.id}`)]);
  rows.push([btn("➕ Add class type(s)", `ed:a:g:${m.id}:${chapter.id}`)]);
  rows.push(itemControls("c", m.id, chapter.id));
  rows.push([btn("⬅️ Back", `ed:o:${m.id}:${operation.id}`)]);
  await show(
    ctx,
    `${heading("📖", chapter.title)}\nChapter in ${esc(operation.title)}\n\n${chapter.classTypes.length ? "Class types (for example \"Foundation Class\"):" : "No class types yet. Patrols live inside a class type."}`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }
  );
}

async function showClassType(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string, classTypeId: string) {
  const m = await loadMission(ctx, services, userId, missionId);
  if (!m) return;
  const { chapter, classType } = locate(m, classTypeId);
  if (!chapter || !classType) return void (await showContent(ctx, services, userId, missionId));
  const rows: InlineKeyboardButton[][] = classType.patrols
    .slice(0, MAX_LIST)
    .map((p) => [btn(`${p.scheduledStart ? ICON.live : "🎬"} ${p.title}`.slice(0, 60), `ed:p:${m.id}:${p.id}`)]);
  rows.push([btn(`➕ Add ${TERMS.lesson}(s)`, `ed:a:p:${m.id}:${classType.id}`), btn(`${ICON.live} Add a live class`, `ed:live:${m.id}:${classType.id}`)]);
  rows.push(itemControls("g", m.id, classType.id));
  rows.push([btn("⬅️ Back", `ed:ch:${m.id}:${chapter.id}`)]);
  await show(ctx, `${heading("🗂️", classType.title)}\nClass type in ${esc(chapter.title)}\n\n${classType.patrols.length ? `${TERMS.lesson}s:` : `No ${TERMS.lesson}s yet.`}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function showPatrol(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string, patrolId: string) {
  const m = await loadMission(ctx, services, userId, missionId);
  if (!m) return;
  const { classType, patrol } = locate(m, patrolId);
  if (!classType || !patrol) return void (await showContent(ctx, services, userId, missionId));
  const text = [
    heading(patrol.scheduledStart ? ICON.live : "🎬", patrol.title),
    `${TERMS.lesson} in ${esc(classType.title)}`,
    "",
    `Video: youtu.be/${esc(patrol.youtubeVideoId)}`,
    patrol.scheduledStart ? `${ICON.clock} Live class: ${formatBstDateTime(patrol.scheduledStart)}` : "",
    `Free preview: ${patrol.isPreview ? "yes" : "no"}`,
    `Thumbnail: ${patrol.hasThumbnail ? ICON.done : "none"}`,
    "",
    patrol.description ? esc(patrol.description.slice(0, 600)) : "_No description._",
  ]
    .filter((l, i, all) => l !== "" || (all[i - 1] ?? "") !== "")
    .join("\n");
  const rows: InlineKeyboardButton[][] = [
    [btn("✏️ Title", `ed:pf:${m.id}:${patrol.id}:t`), btn("📝 Description", `ed:pf:${m.id}:${patrol.id}:d`)],
    [btn("🎬 Video link", `ed:pf:${m.id}:${patrol.id}:v`), btn(patrol.isPreview ? "🔒 Not a preview" : "👁️ Free preview", `ed:pv:${m.id}:${patrol.id}`)],
    [btn(`🖼️ ${patrol.hasThumbnail ? "Change" : "Add"} thumbnail`, `ed:pi:${m.id}:${patrol.id}`)],
  ];
  if (patrol.hasThumbnail) rows[2]!.push(btn("🗑️ Remove thumbnail", `ed:pix:${m.id}:${patrol.id}`));
  rows.push([btn(`🗑️ Delete ${TERMS.lesson}`, `ed:dl:p:${m.id}:${patrol.id}`)]);
  rows.push([btn("⬅️ Back", `ed:g:${m.id}:${classType.id}`)]);
  await show(ctx, text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
}

/** Where to go back to after a change to `itemId` (or after deleting it: its parent). */
async function showAfter(ctx: ProggaaBotContext, services: ServiceContainer, userId: string, missionId: string, screen: string) {
  const [kind, itemId = ""] = screen.split(":");
  if (kind === "o") return showOperation(ctx, services, userId, missionId, itemId);
  if (kind === "c") return showChapter(ctx, services, userId, missionId, itemId);
  if (kind === "g") return showClassType(ctx, services, userId, missionId, itemId);
  if (kind === "p") return showPatrol(ctx, services, userId, missionId, itemId);
  if (kind === "content") return showContent(ctx, services, userId, missionId);
  return showMission(ctx, services, userId, missionId);
}

// ---------------------------------------------------------------------
// Applying a change
// ---------------------------------------------------------------------

async function apply(
  ctx: ProggaaBotContext,
  services: ServiceContainer,
  userId: string,
  missionId: string,
  change: BuilderChange,
  after: string,
  done: string
) {
  const result = await services.builderService.apply(userId, missionId, change);
  logger.audit("mission.edited_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId, op: change.op });
  const note = change.op === "bulk.add" && result.added !== undefined ? `${ICON.done} Added ${result.added}.` : `${ICON.done} ${done}`;
  await ctx.reply(note);
  await showAfter(ctx, services, userId, missionId, after);
}

/** Asks for a confirming tap before a change that removes or publishes something. */
async function askToConfirm(ctx: ProggaaBotContext, missionId: string, change: BuilderChange, after: string, question: string, label: string) {
  startWizard(ctx, "ed", "confirming", { missionId, change: JSON.stringify(change), after });
  await show(ctx, question, { parse_mode: "Markdown", ...confirmKeyboard("ed:ok", "ed:no", label) });
}

function nameOf(found: Found, kind: Kind): string {
  const item = kind === "o" ? found.operation : kind === "c" ? found.chapter : kind === "g" ? found.classType : found.patrol;
  return item?.title ?? "";
}

function parentScreen(found: Found, kind: Kind): string {
  if (kind === "o") return "content";
  if (kind === "c") return `o:${found.operation?.id ?? ""}`;
  if (kind === "g") return `c:${found.chapter?.id ?? ""}`;
  return `g:${found.classType?.id ?? ""}`;
}

// ---------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------

export function registerEditorCommands(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  const on = (pattern: RegExp | string, run: (ctx: ProggaaBotContext & { match: RegExpExecArray }, userId: string) => Promise<void>) =>
    bot.action(pattern, async (ctx) => {
      await ctx.answerCbQuery();
      await guarded(ctx, MENTOR_ROLES, (userId) => run(ctx as ProggaaBotContext & { match: RegExpExecArray }, userId));
    });

  bot.command("edit", async (ctx) => {
    await guarded(ctx, MENTOR_ROLES, (userId) => showMissionList(ctx, services, userId));
  });
  on("ed:home", (ctx, userId) => showMissionList(ctx, services, userId));
  on(new RegExp(`^ed:m:(${id})$`), (ctx, userId) => showMission(ctx, services, userId, ctx.match[1]!));
  on(new RegExp(`^ed:c:(${id})$`), (ctx, userId) => showContent(ctx, services, userId, ctx.match[1]!));
  on(new RegExp(`^ed:o:(${id}):(${id})$`), (ctx, userId) => showOperation(ctx, services, userId, ctx.match[1]!, ctx.match[2]!));
  on(new RegExp(`^ed:ch:(${id}):(${id})$`), (ctx, userId) => showChapter(ctx, services, userId, ctx.match[1]!, ctx.match[2]!));
  on(new RegExp(`^ed:g:(${id}):(${id})$`), (ctx, userId) => showClassType(ctx, services, userId, ctx.match[1]!, ctx.match[2]!));
  on(new RegExp(`^ed:p:(${id}):(${id})$`), (ctx, userId) => showPatrol(ctx, services, userId, ctx.match[1]!, ctx.match[2]!));

  // --- a new Mission: title, description, price ---
  on("ed:new", async (ctx) => {
    startWizard(ctx, "ed", "new_title");
    await ctx.reply(`➕ *New ${TERMS.course}*\n\nSend the *title* (at least 5 characters).`, { parse_mode: "Markdown" });
  });

  // --- details ---
  on(new RegExp(`^ed:f:(${id}):(title|sub|desc|price)$`), async (ctx) => {
    const [, missionId, field] = ctx.match;
    startWizard(ctx, "ed", "field", { missionId: missionId!, field: field! });
    const ask = {
      title: "Send the new *title* (5 to 120 characters).",
      sub: "Send the new *subtitle* (a one-line hook for the catalog card), or `-` to remove it.",
      desc: "Send the new *description* (at least 20 characters).",
      price: "Send the *price in taka*, for example `500`. Send `0` to make it free.",
    }[field as "title" | "sub" | "desc" | "price"];
    await ctx.reply(ask, { parse_mode: "Markdown" });
  });

  on(new RegExp(`^ed:free:(${id})$`), (ctx, userId) =>
    apply(ctx, services, userId, ctx.match[1]!, { op: "mission.update", isFree: true, priceTaka: 0 }, "m", `The ${TERMS.course} is free now.`)
  );

  on(new RegExp(`^ed:lv:(${id})$`), async (ctx) => {
    const missionId = ctx.match[1]!;
    await show(ctx, "📶 Which level is this Mission for?", {
      ...Markup.inlineKeyboard([
        Object.entries(LEVELS).slice(0, 2).map(([k, v]) => btn(v.label, `ed:lvs:${missionId}:${k}`)),
        Object.entries(LEVELS).slice(2).map(([k, v]) => btn(v.label, `ed:lvs:${missionId}:${k}`)),
        [btn("⬅️ Back", `ed:m:${missionId}`)],
      ]),
    });
  });
  on(new RegExp(`^ed:lvs:(${id}):([BIAL])$`), (ctx, userId) => {
    const level = LEVELS[ctx.match[2]!]!;
    return apply(ctx, services, userId, ctx.match[1]!, { op: "mission.update", level: level.level }, "m", `Level set to ${level.label}.`);
  });

  on(new RegExp(`^ed:pub:(${id}):([01])$`), async (ctx, userId) => {
    const missionId = ctx.match[1]!;
    const publish = ctx.match[2] === "1";
    const m = await loadMission(ctx, services, userId, missionId);
    if (!m) return;
    await askToConfirm(
      ctx,
      missionId,
      { op: "mission.publish", publish },
      "m",
      publish
        ? `🚀 Publish *${esc(m.title)}*?\n\nIt will appear in the catalog for everyone.`
        : `⏸️ Unpublish *${esc(m.title)}*?\n\nIt leaves the catalog. Enrolled ${TERMS.student.toLowerCase()}es keep their access.`,
      publish ? "🚀 Publish" : "⏸️ Unpublish"
    );
  });

  on(new RegExp(`^ed:ex:(${id}):([01])$`), (ctx, userId) => {
    const enabled = ctx.match[2] === "1";
    return apply(ctx, services, userId, ctx.match[1]!, { op: "mission.exams", enabled }, "m", `${TERMS.exams} are ${enabled ? "on" : "off"}.`);
  });

  // --- pictures ---
  on(new RegExp(`^ed:img:(${id}):([tr])$`), async (ctx) => {
    const [, missionId, which] = ctx.match;
    startWizard(ctx, "ed", "photo", { missionId: missionId!, target: which === "t" ? "thumbnail" : "routine" });
    await ctx.reply(
      which === "t"
        ? "🖼️ Send the *thumbnail* as a photo. A square picture (about 1080×1080) looks best on the Mission card."
        : "🗓️ Send the *class routine* picture as a photo. It's shown at the top of the Mission page.",
      { parse_mode: "Markdown" }
    );
  });
  on(new RegExp(`^ed:imx:(${id}):([tr])$`), async (ctx) => {
    const [, missionId, which] = ctx.match;
    const thumb = which === "t";
    await askToConfirm(
      ctx,
      missionId!,
      thumb ? { op: "mission.update", removeThumbnail: true } : { op: "mission.update", removeRoutineImage: true },
      "m",
      `🗑️ Remove the ${thumb ? "thumbnail" : "class routine picture"}? It is deleted from storage.`,
      "🗑️ Remove"
    );
  });

  // --- outline: add, rename, delete ---
  on(new RegExp(`^ed:a:([ocgp]):(${id}):(${id})$`), async (ctx) => {
    const [, kind, missionId, parentId] = ctx.match;
    startWizard(ctx, "ed", "add", { missionId: missionId!, kind: kind!, parentId: parentId! });
    const what = KIND_NAME[kind as Kind];
    await ctx.reply(
      kind === "p"
        ? `➕ Send the ${TERMS.lesson} as \`Title | YouTube link\`.\nSeveral at once: one per line.`
        : `➕ Send the ${what}'s title.\nSeveral at once: one per line.`,
      { parse_mode: "Markdown" }
    );
  });

  on(new RegExp(`^ed:live:(${id}):(${id})$`), async (ctx) => {
    const [, missionId, classTypeId] = ctx.match;
    startWizard(ctx, "ed", "live_title", { missionId: missionId!, classTypeId: classTypeId! });
    await ctx.reply(`${ICON.live} *New live class*\n\nSend its *title*.`, { parse_mode: "Markdown" });
  });

  on(new RegExp(`^ed:rn:([ocg]):(${id}):(${id})$`), async (ctx, userId) => {
    const [, kind, missionId, itemId] = ctx.match;
    const m = await loadMission(ctx, services, userId, missionId!);
    if (!m) return;
    const name = nameOf(locate(m, itemId!), kind as Kind);
    if (!name) return void (await show(ctx, "That item no longer exists."));
    startWizard(ctx, "ed", "rename", { missionId: missionId!, kind: kind!, itemId: itemId! });
    await ctx.reply(`✏️ Send the new name for *${esc(name)}*.`, { parse_mode: "Markdown" });
  });

  on(new RegExp(`^ed:dl:([ocgp]):(${id}):(${id})$`), async (ctx, userId) => {
    const [, kind, missionId, itemId] = ctx.match;
    const m = await loadMission(ctx, services, userId, missionId!);
    if (!m) return;
    const found = locate(m, itemId!);
    const name = nameOf(found, kind as Kind);
    if (!name) return void (await show(ctx, "That item no longer exists."));
    const change: BuilderChange =
      kind === "o"
        ? { op: "operation.delete", operationId: itemId! }
        : kind === "c"
          ? { op: "chapter.delete", chapterId: itemId! }
          : kind === "g"
            ? { op: "classtype.delete", classTypeId: itemId! }
            : { op: "patrol.delete", patrolId: itemId! };
    const inside = kind === "p" ? "" : `\n\n${ICON.warn} Everything inside it is deleted too, including ${TERMS.student.toLowerCase()}es' progress on those ${TERMS.lesson}s.`;
    await askToConfirm(ctx, missionId!, change, parentScreen(found, kind as Kind), `🗑️ Delete the ${KIND_NAME[kind as Kind]} *${esc(name)}*?${inside}\n\nThis can't be undone.`, "🗑️ Delete");
  });

  // --- a Patrol ---
  on(new RegExp(`^ed:pf:(${id}):(${id}):([tdv])$`), async (ctx) => {
    const [, missionId, patrolId, field] = ctx.match;
    startWizard(ctx, "ed", "pfield", { missionId: missionId!, patrolId: patrolId!, field: field! });
    const ask = {
      t: "Send the new *title*.",
      d: "Send the new *description*, or `-` to remove it.",
      v: "Send the new *YouTube link*.",
    }[field as "t" | "d" | "v"];
    await ctx.reply(ask, { parse_mode: "Markdown" });
  });

  on(new RegExp(`^ed:pv:(${id}):(${id})$`), async (ctx, userId) => {
    const [, missionId, patrolId] = ctx.match;
    const m = await loadMission(ctx, services, userId, missionId!);
    if (!m) return;
    const { patrol } = locate(m, patrolId!);
    if (!patrol) return void (await show(ctx, "That Patrol no longer exists."));
    await apply(
      ctx,
      services,
      userId,
      missionId!,
      { op: "patrol.update", patrolId: patrolId!, isPreview: !patrol.isPreview },
      `p:${patrolId}`,
      patrol.isPreview ? "It's no longer a free preview." : "Anyone can watch it now as a free preview."
    );
  });

  on(new RegExp(`^ed:pi:(${id}):(${id})$`), async (ctx) => {
    const [, missionId, patrolId] = ctx.match;
    startWizard(ctx, "ed", "photo", { missionId: missionId!, target: "patrol", patrolId: patrolId! });
    await ctx.reply(`🖼️ Send the ${TERMS.lesson}'s *thumbnail* as a photo.`, { parse_mode: "Markdown" });
  });
  on(new RegExp(`^ed:pix:(${id}):(${id})$`), async (ctx) => {
    const [, missionId, patrolId] = ctx.match;
    await askToConfirm(ctx, missionId!, { op: "patrol.update", patrolId: patrolId!, removeThumbnail: true }, `p:${patrolId}`, "🗑️ Remove this Patrol's thumbnail?", "🗑️ Remove");
  });

  // --- confirming ---
  on("ed:ok", async (ctx, userId) => {
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "ed" || wizard.step !== "confirming") {
      return void (await show(ctx, "That request expired. Open the Mission again."));
    }
    const { missionId = "", change = "", after = "m" } = wizard.data;
    clearWizard(ctx);
    await apply(ctx, services, userId, missionId, JSON.parse(change) as BuilderChange, after, "Done.");
  });
  bot.action("ed:no", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    clearWizard(ctx);
    await show(ctx, "Cancelled. Nothing was changed.");
  });

  // --- photos for the "send a picture" steps ---
  bot.on(["photo", "document"], async (ctx, next) => {
    const wizard = ctx.session.wizard;
    if (ctx.chatMode !== "private" || !wizard || wizard.name !== "ed" || wizard.step !== "photo") return next();
    await guarded(ctx, MENTOR_ROLES, async (userId) => {
      const message = ctx.message as { photo?: { file_id: string; file_size?: number }[]; document?: { file_id: string; file_size?: number; mime_type?: string; file_name?: string } };
      const photo = message.photo?.[message.photo.length - 1];
      const doc = message.document;
      if (!photo && !(doc && /^image\/(jpeg|png|webp)$/.test(doc.mime_type ?? ""))) {
        return void (await ctx.reply("Please send a picture (a photo, or a JPG, PNG or WebP file)."));
      }
      const file = photo ?? doc!;
      if ((file.file_size ?? 0) > MAX_IMAGE_BYTES) {
        return void (await ctx.reply("That picture is too large. Send it as a photo (not a file) so Telegram compresses it."));
      }

      const { missionId = "", target = "thumbnail", patrolId } = wizard.data;
      await ctx.reply("⏳ Uploading…");
      const link = await ctx.telegram.getFileLink(file.file_id);
      const res = await fetch(link.toString());
      if (!res.ok) return void (await ctx.reply("I couldn't download that picture from Telegram. Please send it again."));
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        return void (await ctx.reply("That picture is too large. Send it as a photo (not a file) so Telegram compresses it."));
      }
      const mimeType = photo ? "image/jpeg" : doc!.mime_type!;
      clearWizard(ctx);
      await services.builderService.uploadImage(
        userId,
        missionId,
        target as BuilderImageTarget,
        { bytes, mimeType, filename: doc?.file_name ?? `${target}.${mimeType.split("/")[1]}` },
        patrolId
      );
      logger.audit("mission.image_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId, target });
      await ctx.reply(`${ICON.done} Picture saved to Proggaa.`);
      await showAfter(ctx, services, userId, missionId, target === "patrol" ? `p:${patrolId}` : "m");
    });
  });
}

// ---------------------------------------------------------------------
// Typed answers
// ---------------------------------------------------------------------

/** Accepts "500", "৳500", "500.50", "1,200". */
export function parseTaka(text: string): number | null {
  const cleaned = text.replace(/[৳,\s]/g, "").replace(/^tk/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value <= 1_000_000 ? value : null;
}

const YOUTUBE = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+$/i;

/** Text router entry for the editor's typed steps. */
export async function handleEditorTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "ed") return;
  await guarded(ctx, MENTOR_ROLES, async (userId) => {
    const d = wizard.data;
    const missionId = d.missionId ?? "";

    const bounded = async (max: number, what: string) => {
      const v = validateBoundedText(text, max);
      if (!v.ok) await ctx.reply(`The ${what} ${v.error}. Please try again.`);
      return v.ok ? v.value : null;
    };

    switch (wizard.step) {
      case "new_title": {
        const title = await bounded(120, "title");
        if (!title) return;
        d.title = title;
        wizard.step = "new_desc";
        return void (await ctx.reply("Now send a *description* (at least 20 characters): what will Heroes be able to do after it?", { parse_mode: "Markdown" }));
      }
      case "new_desc": {
        const description = await bounded(5000, "description");
        if (!description) return;
        d.description = description;
        wizard.step = "new_price";
        return void (await ctx.reply("Last one: the *price in taka* (send `0` for a free Mission).", { parse_mode: "Markdown" }));
      }
      case "new_price": {
        const price = parseTaka(text);
        if (price === null) return void (await ctx.reply("Send a number of taka, for example 500, or 0 for free."));
        clearWizard(ctx);
        const created = await services.builderService.createMission(userId, { title: d.title ?? "", description: d.description ?? "", priceTaka: price });
        logger.audit("mission.created_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: userId, missionId: created.id });
        await ctx.reply(`${ICON.done} ${TERMS.course} created as a draft. Add its content, then publish it.`);
        return void (await showMission(ctx, services, userId, created.id));
      }

      case "field": {
        clearWizard(ctx);
        if (d.field === "price") {
          const price = parseTaka(text);
          if (price === null) {
            startWizard(ctx, "ed", "field", d);
            return void (await ctx.reply("Send a number of taka, for example 500, or 0 for free."));
          }
          return apply(ctx, services, userId, missionId, { op: "mission.update", isFree: price === 0, priceTaka: price }, "m", price === 0 ? "It's free now." : `Price set to ${formatTaka(price)}.`);
        }
        if (d.field === "sub") {
          const sub = text.trim() === "-" ? "" : await bounded(200, "subtitle");
          if (sub === null) return void startWizard(ctx, "ed", "field", d);
          return apply(ctx, services, userId, missionId, { op: "mission.update", subtitle: sub }, "m", sub ? "Subtitle saved." : "Subtitle removed.");
        }
        const value = await bounded(d.field === "title" ? 120 : 5000, d.field === "title" ? "title" : "description");
        if (value === null) return void startWizard(ctx, "ed", "field", d);
        return apply(ctx, services, userId, missionId, d.field === "title" ? { op: "mission.update", title: value } : { op: "mission.update", description: value }, "m", "Saved.");
      }

      case "add": {
        const value = await bounded(8000, "list");
        if (value === null) return;
        clearWizard(ctx);
        const kind = d.kind as Kind;
        return apply(ctx, services, userId, missionId, { op: "bulk.add", kind: BULK_KIND[kind], parentId: d.parentId ?? "", text: value }, kind === "o" ? "content" : `${kind === "c" ? "o" : kind === "g" ? "c" : "g"}:${d.parentId}`, "Added.");
      }

      case "rename": {
        const title = await bounded(120, "name");
        if (title === null) return;
        clearWizard(ctx);
        const itemId = d.itemId ?? "";
        const change: BuilderChange =
          d.kind === "o"
            ? { op: "operation.rename", operationId: itemId, title }
            : d.kind === "c"
              ? { op: "chapter.rename", chapterId: itemId, title }
              : { op: "classtype.rename", classTypeId: itemId, title };
        return apply(ctx, services, userId, missionId, change, `${d.kind}:${itemId}`, "Renamed.");
      }

      case "pfield": {
        const patrolId = d.patrolId ?? "";
        if (d.field === "v") {
          const url = text.trim();
          if (!YOUTUBE.test(url)) return void (await ctx.reply("That doesn't look like a YouTube link. Please try again."));
          clearWizard(ctx);
          return apply(ctx, services, userId, missionId, { op: "patrol.update", patrolId, youtubeUrl: url }, `p:${patrolId}`, "Video link saved.");
        }
        if (d.field === "d") {
          const description = text.trim() === "-" ? "" : await bounded(2000, "description");
          if (description === null) return;
          clearWizard(ctx);
          return apply(ctx, services, userId, missionId, { op: "patrol.update", patrolId, description }, `p:${patrolId}`, description ? "Description saved." : "Description removed.");
        }
        const title = await bounded(120, "title");
        if (title === null) return;
        clearWizard(ctx);
        return apply(ctx, services, userId, missionId, { op: "patrol.update", patrolId, title }, `p:${patrolId}`, "Title saved.");
      }

      case "live_title": {
        const title = await bounded(120, "title");
        if (!title) return;
        d.title = title;
        wizard.step = "live_video";
        return void (await ctx.reply("Send the class's *YouTube link* (the live stream or where the recording will be).", { parse_mode: "Markdown" }));
      }
      case "live_video": {
        const url = text.trim();
        if (!YOUTUBE.test(url)) return void (await ctx.reply("That doesn't look like a YouTube link. Please try again."));
        d.video = url;
        wizard.step = "live_start";
        return void (await ctx.reply("When does it start? Bangladesh time, as `YYYY-MM-DD HH:MM`, for example `2026-10-20 19:30`.", { parse_mode: "Markdown" }));
      }
      case "live_start": {
        const start = parseBstDateTimeInput(text);
        if (!start) return void (await ctx.reply("Please use the form YYYY-MM-DD HH:MM, for example 2026-10-20 19:30."));
        clearWizard(ctx);
        return apply(
          ctx,
          services,
          userId,
          missionId,
          { op: "patrol.create", classTypeId: d.classTypeId ?? "", title: d.title ?? "", youtubeUrl: d.video ?? "", scheduledStart: start },
          `g:${d.classTypeId}`,
          `Live class scheduled for ${text.trim()} (Bangladesh time).`
        );
      }

      case "photo":
        return void (await ctx.reply("Please send a picture, or tap ↩️ to go back.", Markup.inlineKeyboard([[btn("↩️ Cancel", "ed:no")]])));

      default:
        clearWizard(ctx);
    }
  });
}
