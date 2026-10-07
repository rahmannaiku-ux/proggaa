import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/typings/core/types/typegram";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import type { AdminChange, ManagedMission, ManagedUser, MissionStatus } from "../../types/editing";
import { ENTITY_ID_PATTERN, TEXT_LIMITS, validateBoundedText } from "../../utils/validation";
import { formatBstDate } from "../../utils/time";
import { logger } from "../../utils/logger";
import { ICON, TERMS, esc, formatNumber, formatTaka, heading } from "../messages/brand";
import { confirmKeyboard } from "../keyboards/mainMenu";
import { clearWizard, startWizard } from "../handlers/wizard";
import { guarded, show } from "../screens";
import { parseTaka } from "./editor";

/**
 * The admin panel's everyday tools, from the chat: find an account and change its role,
 * suspend it or correct its Proggy Coins; approve co-Mentor requests; publish, archive
 * and discount Missions; switch Proggy Store items on and off; announce to everyone; add
 * a category. Every change is confirmed first, and Proggaa enforces its own rules (only a
 * super admin may touch admins) with the same code as the admin panel.
 */

const id = ENTITY_ID_PATTERN;
const ADMIN = ["ADMIN"] as const;
const btn = (text: string, data: string) => Markup.button.callback(text, data);

const ROLE_CODE = { S: "STUDENT", T: "TEACHER", A: "ADMIN", X: "SUPER_ADMIN" } as const;
const ROLE_LABEL: Record<ManagedUser["role"], string> = {
  STUDENT: TERMS.student,
  TEACHER: TERMS.teacher,
  ADMIN: "Admin",
  SUPER_ADMIN: "Super admin",
};
const STATUS_CODE = { D: "DRAFT", P: "PUBLISHED", A: "ARCHIVED" } as const;
const STATUS_LABEL: Record<MissionStatus, string> = { DRAFT: "📝 Draft", PUBLISHED: "🟢 Published", ARCHIVED: "🗄️ Archived" };

function userCard(u: ManagedUser): string {
  return [
    heading("👤", u.name || "No name"),
    "",
    `Role: ${ROLE_LABEL[u.role]}${u.isSuspended ? ` · ${ICON.danger} suspended` : ""}`,
    u.phone ? `Phone: ${esc(u.phone)}` : "",
    u.email ? `Email: ${esc(u.email)}` : "",
    `${ICON.xp} ${formatNumber(u.xp)} XP · ${ICON.coins} ${formatNumber(u.coinBalance)} · ${ICON.streak} ${u.streakDays} days`,
    `${TERMS.courses}: ${u.enrollmentCount} · joined ${formatBstDate(u.createdAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function userKeyboard(u: ManagedUser) {
  const rows: InlineKeyboardButton[][] = [
    [btn("🎭 Change role", `am:r:${u.id}`), u.isSuspended ? btn("✅ Unsuspend", `am:su:${u.id}:0`) : btn("⛔ Suspend", `am:su:${u.id}:1`)],
  ];
  if (u.role === "STUDENT") rows.push([btn(`${ICON.coins} Adjust ${TERMS.coins}`, `am:co:${u.id}`)]);
  rows.push([btn("🔎 Find another", "am:user"), btn("⬅️ Admin", "menu:admin")]);
  return Markup.inlineKeyboard(rows);
}

function discountLine(m: ManagedMission): string {
  const d = m.discount;
  if (!d) return "none";
  const off = d.percentOff !== null ? `${d.percentOff}% off` : `${formatTaka(d.amountOffTaka ?? 0)} off`;
  return `${off}${d.isActive ? "" : " (paused)"}`;
}

/** Shows the confirmation for `change`; the confirming tap sends it. */
async function askToConfirm(ctx: ProggaaBotContext, change: AdminChange, question: string, label: string, back = "menu:admin") {
  startWizard(ctx, "am", "confirming", { change: JSON.stringify(change), back });
  await show(ctx, question, { parse_mode: "Markdown", ...confirmKeyboard("am:ok", "am:no", label) });
}

async function showMissionAdmin(ctx: ProggaaBotContext, services: ServiceContainer, adminId: string, missionId: string) {
  const missions = await services.adminManageService.listMissions(adminId);
  const m = missions.find((x) => x.id === missionId);
  if (!m) return void (await show(ctx, `That ${TERMS.course} is not in the recent list any more.`));
  const rows: InlineKeyboardButton[][] = [
    (Object.entries(STATUS_CODE) as [keyof typeof STATUS_CODE, MissionStatus][])
      .filter(([, s]) => s !== m.status)
      .map(([code, s]) => btn(STATUS_LABEL[s], `am:ms:${m.id}:${code}`)),
  ];
  if (!m.isFree) {
    rows.push([btn("🏷️ % off", `am:dp:${m.id}`), btn("🏷️ ৳ off", `am:da:${m.id}`)]);
    if (m.discount) {
      rows.push([
        m.discount.isActive ? btn("⏸️ Pause discount", `am:dt:${m.id}:0`) : btn("▶️ Resume discount", `am:dt:${m.id}:1`),
        btn("🗑️ Remove discount", `am:dx:${m.id}`),
      ]);
    }
  }
  rows.push([btn("✏️ Edit content and details", `ed:m:${m.id}`)]);
  rows.push([btn("⬅️ Missions", "am:missions")]);
  await show(
    ctx,
    [
      heading(ICON.mission, m.title),
      "",
      `${STATUS_LABEL[m.status]} · ${TERMS.teacher}: ${esc(m.mentorName)}`,
      `Price: ${m.isFree ? "Free" : formatTaka(m.priceTaka)} · Discount: ${esc(discountLine(m))}`,
      `${TERMS.student}es enrolled: ${m.enrollmentCount}`,
    ].join("\n"),
    { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }
  );
}

export function registerAdminManageCommands(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  const on = (pattern: RegExp | string, run: (ctx: ProggaaBotContext & { match: RegExpExecArray }, adminId: string) => Promise<void>) =>
    bot.action(pattern, async (ctx) => {
      await ctx.answerCbQuery();
      await guarded(ctx, [...ADMIN], (adminId) => run(ctx as ProggaaBotContext & { match: RegExpExecArray }, adminId));
    });

  // --- accounts ---
  on("am:user", async (ctx) => {
    startWizard(ctx, "am", "find_user");
    await ctx.reply("🔎 Send the person's phone number or email.");
  });

  on(new RegExp(`^am:r:(${id})$`), async (ctx) => {
    const userId = ctx.match[1]!;
    await show(ctx, "🎭 Which role?", {
      ...Markup.inlineKeyboard([
        [btn(TERMS.student, `am:rs:${userId}:S`), btn(TERMS.teacher, `am:rs:${userId}:T`)],
        [btn("Admin", `am:rs:${userId}:A`), btn("Super admin", `am:rs:${userId}:X`)],
        [btn("↩️ Cancel", "am:no")],
      ]),
    });
  });
  on(new RegExp(`^am:rs:(${id}):([STAX])$`), async (ctx) => {
    const role = ROLE_CODE[ctx.match[2] as keyof typeof ROLE_CODE];
    await askToConfirm(ctx, { op: "user.role", userId: ctx.match[1]!, role }, `🎭 Make this account a *${ROLE_LABEL[role]}*?`, "🎭 Change role");
  });

  on(new RegExp(`^am:su:(${id}):([01])$`), async (ctx) => {
    const suspended = ctx.match[2] === "1";
    await askToConfirm(
      ctx,
      { op: "user.suspend", userId: ctx.match[1]!, suspended },
      suspended ? "⛔ Suspend this account? They can't sign in until you unsuspend it." : "✅ Unsuspend this account?",
      suspended ? "⛔ Suspend" : "✅ Unsuspend"
    );
  });

  on(new RegExp(`^am:co:(${id})$`), async (ctx) => {
    startWizard(ctx, "am", "coins_amount", { userId: ctx.match[1]! });
    await ctx.reply(`${ICON.coins} How many ${TERMS.coins}? Send a whole number: \`50\` adds, \`-50\` takes away.`, { parse_mode: "Markdown" });
  });

  // --- co-Mentor requests ---
  on("am:requests", async (ctx, adminId) => {
    const requests = await services.adminManageService.listCoMentorRequests(adminId);
    if (requests.length === 0) return void (await show(ctx, `${ICON.done} No co-${TERMS.teacher} requests waiting.`, Markup.inlineKeyboard([[btn("⬅️ Admin", "menu:admin")]])));
    await show(ctx, heading(ICON.mentor, `Co-${TERMS.teacher} requests (${requests.length})`), { parse_mode: "Markdown" });
    for (const r of requests) {
      await ctx.reply(
        `*${esc(r.mentorName)}* → ${esc(r.missionTitle)}${r.roleLabel ? ` (${esc(r.roleLabel)})` : ""}\nAsked by ${esc(r.requestedByName)} on ${formatBstDate(r.createdAt)}`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[btn("✅ Approve", `am:ra:${r.id}`), btn("❌ Decline", `am:rr:${r.id}`)]]) }
      );
    }
  });
  on(new RegExp(`^am:ra:(${id})$`), async (ctx) => {
    await askToConfirm(ctx, { op: "request.approve", requestId: ctx.match[1]! }, `✅ Approve? The ${TERMS.teacher} gets full access to manage the ${TERMS.course}.`, "✅ Approve", "am:requests");
  });
  on(new RegExp(`^am:rr:(${id})$`), async (ctx) => {
    startWizard(ctx, "am", "reject_reason", { requestId: ctx.match[1]! });
    await ctx.reply(`Why are you declining? The ${TERMS.teacher} who asked will see this. Send \`-\` for no reason.`, { parse_mode: "Markdown" });
  });

  // --- Missions ---
  on("am:missions", async (ctx, adminId) => {
    const missions = await services.adminManageService.listMissions(adminId);
    const rows = missions.map((m) => [btn(`${STATUS_LABEL[m.status].split(" ")[0]} ${m.title}`.slice(0, 60), `am:m:${m.id}`)]);
    rows.push([btn("⬅️ Admin", "menu:admin")]);
    await show(ctx, `${heading(ICON.mission, `${TERMS.courses}`)}\n\nPublish, archive or discount a ${TERMS.course}:`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(rows),
    });
  });
  on(new RegExp(`^am:m:(${id})$`), (ctx, adminId) => showMissionAdmin(ctx, services, adminId, ctx.match[1]!));
  on(new RegExp(`^am:ms:(${id}):([DPA])$`), async (ctx) => {
    const status = STATUS_CODE[ctx.match[2] as keyof typeof STATUS_CODE];
    await askToConfirm(ctx, { op: "mission.status", missionId: ctx.match[1]!, status }, `Set this ${TERMS.course} to *${STATUS_LABEL[status]}*?`, "✅ Set", `am:m:${ctx.match[1]}`);
  });
  on(new RegExp(`^am:d([pa]):(${id})$`), async (ctx) => {
    const percent = ctx.match[1] === "p";
    startWizard(ctx, "am", percent ? "discount_percent" : "discount_amount", { missionId: ctx.match[2]! });
    await ctx.reply(percent ? "🏷️ How many percent off? Send a number from 1 to 100." : "🏷️ How many taka off? For example `200`.", { parse_mode: "Markdown" });
  });
  on(new RegExp(`^am:dt:(${id}):([01])$`), async (ctx) => {
    const active = ctx.match[2] === "1";
    await askToConfirm(ctx, { op: "discount.toggle", missionId: ctx.match[1]!, active }, active ? "▶️ Resume the discount?" : "⏸️ Pause the discount?", "✅ Yes", `am:m:${ctx.match[1]}`);
  });
  on(new RegExp(`^am:dx:(${id})$`), async (ctx) => {
    await askToConfirm(ctx, { op: "discount.delete", missionId: ctx.match[1]! }, "🗑️ Remove the discount? The full price applies again.", "🗑️ Remove", `am:m:${ctx.match[1]}`);
  });

  // --- Proggy Store ---
  on("am:store", async (ctx, adminId) => {
    const items = await services.adminManageService.listStoreItems(adminId);
    const rows = items.map((i) => [btn(`${i.isPublished ? "🟢" : "⚪"} ${i.title} · ${i.priceCoins}🪙`.slice(0, 60), `am:si:${i.id}:${i.isPublished ? 0 : 1}`)]);
    rows.push([btn("⬅️ Admin", "menu:admin")]);
    await show(ctx, `${heading("🛍️", "Proggy Store")}\n\nTap an item to switch it on (🟢) or off (⚪).`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });
  on(new RegExp(`^am:si:(${id}):([01])$`), async (ctx, adminId) => {
    const published = ctx.match[2] === "1";
    await services.adminManageService.apply(adminId, { op: "store.toggle", itemId: ctx.match[1]!, published });
    logger.audit("store.toggled_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: adminId, itemId: ctx.match[1] });
    const items = await services.adminManageService.listStoreItems(adminId);
    const rows = items.map((i) => [btn(`${i.isPublished ? "🟢" : "⚪"} ${i.title} · ${i.priceCoins}🪙`.slice(0, 60), `am:si:${i.id}:${i.isPublished ? 0 : 1}`)]);
    rows.push([btn("⬅️ Admin", "menu:admin")]);
    await show(ctx, `${heading("🛍️", "Proggy Store")}\n\n${ICON.done} ${published ? "Now in the store." : "Taken out of the store."}`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
  });

  // --- everyone ---
  on("am:announce", async (ctx) => {
    startWizard(ctx, "am", "announce_title");
    await ctx.reply("📣 *Announcement to everyone on Proggaa*\n\nSend the *title*.", { parse_mode: "Markdown" });
  });
  on("am:category", async (ctx) => {
    startWizard(ctx, "am", "category_name");
    await ctx.reply("🏷️ Send the new category's name.");
  });

  // --- confirming ---
  on("am:ok", async (ctx, adminId) => {
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "am" || wizard.step !== "confirming") {
      return void (await show(ctx, "That request expired. Start again from the Admin menu."));
    }
    const change = JSON.parse(wizard.data.change ?? "{}") as AdminChange;
    const back = wizard.data.back ?? "menu:admin";
    clearWizard(ctx);
    const result = await services.adminManageService.apply(adminId, change);
    logger.audit("admin.change_via_bot", { telegramId: ctx.auth.telegramId, proggaaUserId: adminId, op: change.op });
    if (result.user) return void (await show(ctx, `${ICON.done} Done.\n\n${userCard(result.user)}`, { parse_mode: "Markdown", ...userKeyboard(result.user) }));
    if (back.startsWith("am:m:")) {
      await ctx.reply(`${ICON.done} Done.`);
      return showMissionAdmin(ctx, services, adminId, back.slice(5));
    }
    await show(ctx, `${ICON.done} ${result.message ?? "Done."}`, Markup.inlineKeyboard([[btn("⬅️ Admin", "menu:admin")]]));
  });
  bot.action("am:no", async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    clearWizard(ctx);
    await show(ctx, "Cancelled. Nothing was changed.");
  });
}

/** Text router entry for the admin tools' typed steps. */
export async function handleAdminManageTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "am") return;
  await guarded(ctx, [...ADMIN], async (adminId) => {
    const d = wizard.data;
    switch (wizard.step) {
      case "find_user": {
        const v = validateBoundedText(text, TEXT_LIMITS.heroIdentifier);
        if (!v.ok) return void (await ctx.reply(`That ${v.error}. Please try again.`));
        clearWizard(ctx);
        const user = await services.adminManageService.findUser(adminId, v.value);
        if (!user) return void (await ctx.reply("No account with that phone number or email.", Markup.inlineKeyboard([[btn("🔎 Try again", "am:user")]])));
        return void (await ctx.reply(userCard(user), { parse_mode: "Markdown", ...userKeyboard(user) }));
      }
      case "coins_amount": {
        const amount = Number(text.trim().replace(/^\+/, ""));
        if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
          return void (await ctx.reply("Send a whole number that isn't 0, for example 50 or -50."));
        }
        d.amount = String(amount);
        wizard.step = "coins_reason";
        return void (await ctx.reply("Why? The reason is saved in their coin history."));
      }
      case "coins_reason": {
        const v = validateBoundedText(text, TEXT_LIMITS.rejectReason);
        if (!v.ok) return void (await ctx.reply(`The reason ${v.error}. Please try again.`));
        const amount = Number(d.amount);
        return askToConfirm(
          ctx,
          { op: "coins.adjust", userId: d.userId ?? "", amount, reason: v.value },
          `${ICON.coins} ${amount > 0 ? "Add" : "Take away"} *${Math.abs(amount)}* ${TERMS.coins}?\nReason: ${esc(v.value)}`,
          `${ICON.coins} ${amount > 0 ? "Add" : "Take away"}`
        );
      }
      case "reject_reason": {
        const reason = text.trim() === "-" ? "" : text.trim().slice(0, 300);
        return askToConfirm(ctx, { op: "request.reject", requestId: d.requestId ?? "", reason }, `❌ Decline this request?${reason ? `\nReason: ${esc(reason)}` : ""}`, "❌ Decline", "am:requests");
      }
      case "discount_percent": {
        const percent = Number(text.trim().replace(/%$/, ""));
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) return void (await ctx.reply("Send a whole number from 1 to 100."));
        return askToConfirm(ctx, { op: "discount.set", missionId: d.missionId ?? "", percentOff: percent }, `🏷️ Set a *${percent}% off* discount, starting now?`, "🏷️ Set discount", `am:m:${d.missionId}`);
      }
      case "discount_amount": {
        const taka = parseTaka(text);
        if (taka === null || taka <= 0) return void (await ctx.reply("Send an amount of taka, for example 200."));
        return askToConfirm(ctx, { op: "discount.set", missionId: d.missionId ?? "", amountOffTaka: taka }, `🏷️ Set a *${formatTaka(taka)} off* discount, starting now?`, "🏷️ Set discount", `am:m:${d.missionId}`);
      }
      case "announce_title": {
        const v = validateBoundedText(text, TEXT_LIMITS.announcementTitle);
        if (!v.ok) return void (await ctx.reply(`The title ${v.error}. Please try again.`));
        d.title = v.value;
        wizard.step = "announce_body";
        return void (await ctx.reply("Now send the *message*.", { parse_mode: "Markdown" }));
      }
      case "announce_body": {
        const v = validateBoundedText(text, 2000);
        if (!v.ok) return void (await ctx.reply(`The message ${v.error}. Please try again.`));
        return askToConfirm(
          ctx,
          { op: "announce.global", title: d.title ?? "", body: v.value },
          `📣 *Preview*\n\n*${esc(d.title ?? "")}*\n${esc(v.value)}\n\n${ICON.warn} Every account on Proggaa gets this notification. Send it?`,
          "📣 Send to everyone"
        );
      }
      case "category_name": {
        const v = validateBoundedText(text, 100);
        if (!v.ok) return void (await ctx.reply(`The name ${v.error}. Please try again.`));
        return askToConfirm(ctx, { op: "category.create", name: v.value }, `🏷️ Add the category *${esc(v.value)}*?`, "🏷️ Add");
      }
      default:
        clearWizard(ctx);
    }
  });
}
