import type { ProggaaBotContext } from "../../types/session";
import type { ProggaaRole } from "../../types/domain";
import { NOT_LINKED_PROMPT, UNAUTHORIZED } from "../messages/copy";
import { logger } from "../../utils/logger";

/**
 * Guards for handlers. They return TRUE when the request was blocked (and the
 * person has already been told why), so a handler reads:
 *
 *     if (await requireRole(ctx, ["ADMIN"])) return;
 *
 * Both rely on ctx.auth, which the auth middleware fills from the website's
 * Telegram link on every update. A role the person claims, or one remembered
 * from earlier, is never used.
 */

export async function requireLinked(ctx: ProggaaBotContext): Promise<boolean> {
  if (!ctx.auth.linked || !ctx.auth.proggaaUserId) {
    await ctx.reply(NOT_LINKED_PROMPT);
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
    await ctx.reply(UNAUTHORIZED);
    return true;
  }
  return false;
}

/** Mentors, and admins, who can see every Mission. */
export const MENTOR_ROLES: ProggaaRole[] = ["TEACHER", "ADMIN"];
