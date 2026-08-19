import type { ProggaaBotContext } from "../../types/session";
import type { ProggaaRole } from "../../types/domain";
import { logger } from "../../utils/logger";

/**
 * Guard helpers used at the start of command/callback handlers.
 * These return `true` if the request was rejected (and already replied to),
 * so the calling handler can `if (await requireLinked(ctx)) return;`.
 */

export async function requireLinked(ctx: ProggaaBotContext): Promise<boolean> {
  if (!ctx.auth.linked) {
    await ctx.reply(
      "🔗 This feature needs a connected Proggaa account.\n\nUse /link to connect your account first."
    );
    return true;
  }
  return false;
}

export async function requireRole(ctx: ProggaaBotContext, allowed: ProggaaRole[]): Promise<boolean> {
  if (await requireLinked(ctx)) return true;

  if (!ctx.auth.role || !allowed.includes(ctx.auth.role)) {
    logger.audit("authorization.denied", {
      telegramId: ctx.auth.telegramId,
      proggaaUserId: ctx.auth.proggaaUserId,
      role: ctx.auth.role,
      required: allowed.join(","),
    });
    await ctx.reply("🚫 You don't have permission to use this feature.");
    return true;
  }
  return false;
}
