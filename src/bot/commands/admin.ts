import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { adminDashboardKeyboard, backToMenuKeyboard } from "../keyboards/mainMenu";
import { formatAdminStats } from "../messages/formatters";
import { ICON, TERMS, formatNumber, heading, plural } from "../messages/brand";
import { registerGroupAdmin } from "./groupAdmin";
import { sendPendingPayments } from "./payments";

export function registerAdminCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("admin", async (ctx) => {
    await sendAdminDashboard(ctx, services);
  });

  bot.action("menu:admin", async (ctx) => {
    await ctx.answerCbQuery();
    await sendAdminDashboard(ctx, services);
  });

  bot.action("admin:payments", async (ctx) => {
    await ctx.answerCbQuery();
    await sendPendingPayments(ctx, services);
  });

  bot.command("stats", async (ctx) => {
    await sendStats(ctx, services);
  });
  bot.action("admin:stats", async (ctx) => {
    await ctx.answerCbQuery();
    await sendStats(ctx, services);
  });

  bot.action("admin:users", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["ADMIN"])) return;
    const stats = await services.adminService.getStatistics(ctx.auth.proggaaUserId!);
    await ctx.reply(
      [heading("👥", "People on Proggaa"), "", `${TERMS.student}s: ${formatNumber(stats.studentCount)}`, `${TERMS.teacher}s: ${formatNumber(stats.teacherCount)}`].join("\n"),
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("Open users on Proggaa", services.deepLinkService.adminUsers())],
          [Markup.button.callback("⬅️ Menu", "menu:home")],
        ]),
      }
    );
  });

  registerGroupAdmin(bot, services);
}

async function sendStats(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["ADMIN"])) return;
  const stats = await services.adminService.getStatistics(ctx.auth.proggaaUserId!);
  await ctx.reply(formatAdminStats(stats), { parse_mode: "Markdown", ...backToMenuKeyboard() });
}

export async function sendAdminDashboard(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["ADMIN"])) return;

  const id = ctx.auth.proggaaUserId!;
  const [stats, pending] = await Promise.all([
    services.adminService.getStatistics(id),
    services.paymentService.getPendingPayments(id),
  ]);

  await ctx.reply(
    [
      heading(ICON.admin, "Admin"),
      "",
      `${ICON.payment} Waiting for verification: ${pending.length}`,
      `${TERMS.student}s: ${formatNumber(stats.studentCount)} · ${plural(stats.courseCount, TERMS.course)}`,
      `${ICON.live} ${TERMS.exams} live now: ${stats.liveExamCount}`,
    ].join("\n"),
    { parse_mode: "Markdown", ...adminDashboardKeyboard(services.groupService.listConfiguredGroups().length > 0) }
  );
}
