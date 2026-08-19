import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { formatAdminStats } from "../messages/formatters";
import { backToMenuKeyboard } from "../keyboards/mainMenu";

export function registerStatsCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("stats", async (ctx) => {
    await sendStats(ctx, services);
  });
}

export async function sendStats(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await requireRole(ctx, ["ADMIN"])) return;
  const stats = await services.adminService.getStatistics();
  await ctx.reply(formatAdminStats(stats), { parse_mode: "Markdown", ...backToMenuKeyboard() });
}
