import { describe, expect, it } from "vitest";
import { InMemoryGroupService } from "../src/services/groups/GroupService";

// Settings/violations/escalations persist in a module-level store (mirrors
// the real singleton usage in container.ts), so each test below uses its
// own chat/user ids to stay independent regardless of execution order.

describe("InMemoryGroupService", () => {
  it("only treats chat ids from the configured list as configured groups", () => {
    const service = new InMemoryGroupService("-100111,-100222");
    expect(service.isConfiguredGroup("-100111")).toBe(true);
    expect(service.isConfiguredGroup("-100999")).toBe(false);
    expect(service.listConfiguredGroups()).toEqual(["-100111", "-100222"]);
  });

  it("returns sensible defaults for a group with no settings yet, and updateSettings only changes what's passed", () => {
    const service = new InMemoryGroupService("-200111");
    const defaults = service.getSettings("-200111");
    expect(defaults).toMatchObject({ welcomeEnabled: true, faqEnabled: true, moderationEnabled: true, bannedKeywords: [] });

    const updated = service.updateSettings("-200111", { moderationEnabled: false });
    expect(updated.moderationEnabled).toBe(false);
    expect(updated.welcomeEnabled).toBe(true); // untouched
  });

  it("escalates moderation actions: 1st violation warns, then mutes, then admin-alerts — never a ban", () => {
    const service = new InMemoryGroupService("-300111");
    const actions = Array.from({ length: 5 }, () => service.recordViolation("-300111", "user_escalation_test", "spam"));
    expect(actions).toEqual(["WARNING", "TEMP_MUTE", "TEMP_MUTE", "TEMP_MUTE", "ADMIN_ALERT"]);
    expect(actions).not.toContain("BAN");
  });

  it("tracks violations per chat+user independently", () => {
    const service = new InMemoryGroupService("-400111");
    service.recordViolation("-400111", "user_indep_a", "spam");
    service.recordViolation("-400111", "user_indep_a", "spam");
    const firstViolationForOtherUser = service.recordViolation("-400111", "user_indep_b", "spam");
    expect(firstViolationForOtherUser).toBe("WARNING");
  });

  it("matches built-in suspicious link patterns and per-group banned keywords", () => {
    const service = new InMemoryGroupService("-500111");
    expect(service.matchesSpamPattern("-500111", "join now bit.ly/scam")).not.toBeNull();
    expect(service.matchesSpamPattern("-500111", "hello, how do I pay?")).toBeNull();

    service.updateSettings("-500111", { bannedKeywords: ["forexsignal"] });
    expect(service.matchesSpamPattern("-500111", "check my forexsignal group")).toMatch(/forexsignal/);
  });

  it("flags flooding once a user exceeds the message threshold within the window", () => {
    const service = new InMemoryGroupService("-600111");
    const results = Array.from({ length: 8 }, () => service.recordMessageAndCheckFlood("-600111", "user_flood_test"));
    expect(results.slice(0, 6)).toEqual([false, false, false, false, false, false]);
    expect(results[7]).toBe(true);
  });

  it("getRecentEscalations can be scoped to a single chat", () => {
    const service = new InMemoryGroupService("-700111,-700222");
    service.recordViolation("-700111", "user_scope_test", "spam");
    service.recordViolation("-700222", "user_scope_test_2", "spam");
    const scoped = service.getRecentEscalations("-700111");
    expect(scoped.every((e) => e.chatId === "-700111")).toBe(true);
  });
});
