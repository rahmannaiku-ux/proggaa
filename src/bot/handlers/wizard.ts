import type { ProggaaBotContext } from "../../types/session";

const WIZARD_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function startWizard(ctx: ProggaaBotContext, name: string, step: string, data: Record<string, string> = {}) {
  ctx.session.wizard = { name, step, data, startedAt: Date.now() };
}

export function clearWizard(ctx: ProggaaBotContext) {
  ctx.session.wizard = undefined;
}

/** Returns true (and clears the wizard) if the active wizard has expired. */
export function isWizardExpired(ctx: ProggaaBotContext): boolean {
  const wizard = ctx.session.wizard;
  if (!wizard) return false;
  const expired = Date.now() - wizard.startedAt > WIZARD_TTL_MS;
  if (expired) clearWizard(ctx);
  return expired;
}
