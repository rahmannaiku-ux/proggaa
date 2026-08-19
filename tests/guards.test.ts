import { describe, expect, it, vi } from "vitest";
import { requireLinked, requireRole } from "../src/bot/middleware/guards";
import type { ProggaaBotContext } from "../src/types/session";

function fakeCtx(auth: Partial<ProggaaBotContext["auth"]>): ProggaaBotContext {
  return {
    auth: { telegramId: "tg_1", linked: false, ...auth },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProggaaBotContext;
}

describe("requireLinked", () => {
  it("rejects and replies when the account is not linked", async () => {
    const ctx = fakeCtx({ linked: false });
    const rejected = await requireLinked(ctx);
    expect(rejected).toBe(true);
    expect(ctx.reply).toHaveBeenCalledOnce();
  });

  it("allows through when the account is linked", async () => {
    const ctx = fakeCtx({ linked: true, proggaaUserId: "user_1", role: "STUDENT" });
    const rejected = await requireLinked(ctx);
    expect(rejected).toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("rejects an unlinked user before checking role", async () => {
    const ctx = fakeCtx({ linked: false });
    const rejected = await requireRole(ctx, ["ADMIN"]);
    expect(rejected).toBe(true);
  });

  it("rejects a STUDENT calling an ADMIN-only guard", async () => {
    const ctx = fakeCtx({ linked: true, proggaaUserId: "user_1", role: "STUDENT" });
    const rejected = await requireRole(ctx, ["ADMIN"]);
    expect(rejected).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("permission"));
  });

  it("allows a TEACHER through a TEACHER-or-ADMIN guard", async () => {
    const ctx = fakeCtx({ linked: true, proggaaUserId: "user_2", role: "TEACHER" });
    const rejected = await requireRole(ctx, ["TEACHER", "ADMIN"]);
    expect(rejected).toBe(false);
  });

  it("allows an ADMIN through an ADMIN-only guard", async () => {
    const ctx = fakeCtx({ linked: true, proggaaUserId: "user_3", role: "ADMIN" });
    const rejected = await requireRole(ctx, ["ADMIN"]);
    expect(rejected).toBe(false);
  });
});
