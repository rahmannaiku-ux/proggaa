import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN, STUDENT, TEACHER, buildFakeContainer } from "./fakes";
import { buildTestBot, callbackUpdate, freshTelegramId, linkAs, textUpdate } from "./helpers/harness";
import { ProggaaUnavailableError } from "../src/services/proggaa/errors";

afterEach(() => vi.restoreAllMocks());

const say = (h: ReturnType<typeof buildTestBot>, tg: number, text: string) => h.bot.handleUpdate(textUpdate(tg, tg, text));
const tap = (h: ReturnType<typeof buildTestBot>, tg: number, data: string) => h.bot.handleUpdate(callbackUpdate(tg, tg, data));

describe("start and linking", () => {
  it("offers to connect an unlinked person, and never treats a username as identity", async () => {
    const h = buildTestBot();
    const tg = freshTelegramId();
    await say(h, tg, "/start");
    expect(h.lastText()).toContain("Connect");
    // The fake sender's username is "testuser"; nothing about it grants access.
    await say(h, tg, "/dashboard");
    expect(h.lastText()).toMatch(/Connect your Proggaa account first/);
  });

  it("links with a valid code, then greets by name", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    expect(h.texts().some((t) => t.includes("Connected"))).toBe(true);
    await say(h, tg, "/start");
    expect(h.lastText()).toContain("Ayesha Rahman");
  });

  it("accepts a code typed in lower case", async () => {
    const h = buildTestBot();
    const tg = freshTelegramId();
    const code = h.services.link.issueToken(STUDENT.id);
    await say(h, tg, "/link");
    await say(h, tg, code.toLowerCase());
    expect(h.texts().some((t) => t.includes("Connected"))).toBe(true);
  });

  it("rejects text that is not a code without sending it to the website", async () => {
    const h = buildTestBot();
    const tg = freshTelegramId();
    await say(h, tg, "/link");
    await say(h, tg, "hello there");
    expect(h.lastText()).toMatch(/invalid, already used, or expired/);
    expect(h.services.link.attempts).toHaveLength(0);
  });

  it("rejects an unknown, an expired and an already used code", async () => {
    const h = buildTestBot();
    const tg = freshTelegramId();

    await say(h, tg, "/link");
    await say(h, tg, "ZZZZ-ZZZZ-ZZZZ");
    expect(h.lastText()).toMatch(/invalid, already used, or expired/);

    const expired = h.services.link.issueToken(STUDENT.id, -1000);
    await say(h, tg, "/link");
    await say(h, tg, expired);
    expect(h.lastText()).toMatch(/invalid, already used, or expired/);

    const once = h.services.link.issueToken(STUDENT.id);
    const first = freshTelegramId();
    await say(h, first, "/link");
    await say(h, first, once);
    expect(h.texts().some((t) => t.includes("Connected"))).toBe(true);

    const second = freshTelegramId();
    await say(h, second, "/link");
    await say(h, second, once);
    expect(h.lastText()).toMatch(/invalid, already used, or expired/);
  });

  it("limits how many codes one person can try", async () => {
    const h = buildTestBot();
    const tg = freshTelegramId();
    for (let i = 0; i < 7; i += 1) {
      await say(h, tg, "/link");
      await say(h, tg, "ZZZZ-ZZZZ-ZZZZ");
    }
    expect(h.texts().some((t) => t.includes("Too many attempts"))).toBe(true);
    expect(h.services.link.attempts.length).toBeLessThanOrEqual(6);
  });

  it("asks for confirmation before unlinking", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/unlink");
    expect(await h.services.link.getLinkedAccount(String(tg))).not.toBeNull();
    await tap(h, tg, "unlink:confirm");
    expect(await h.services.link.getLinkedAccount(String(tg))).toBeNull();
  });
});

describe("private data stays out of groups", () => {
  it("refuses personal commands, buttons and link codes in a group", async () => {
    const h = buildTestBot();
    const tg = freshTelegramId();
    const group = -1001234567890;

    await h.bot.handleUpdate(textUpdate(tg, group, "/dashboard", "supergroup"));
    await h.bot.handleUpdate(textUpdate(tg, group, "/link", "supergroup"));
    expect(h.texts().filter((t) => t.includes("personal"))).toHaveLength(2);

    await h.bot.handleUpdate(callbackUpdate(tg, group, "menu:wallet", "group"));
    expect(h.answers.some((a) => a.text?.includes("private chat"))).toBe(true);

    // A code posted in a group is just text: it is never redeemed.
    const code = h.services.link.issueToken(STUDENT.id);
    await h.bot.handleUpdate(textUpdate(tg, group, code, "supergroup"));
    expect(h.services.link.attempts).toHaveLength(0);
  });
});

describe("roles come from Proggaa, not from the chat", () => {
  it("blocks unlinked people and heroes from admin and mentor tools", async () => {
    const h = buildTestBot();
    const stranger = freshTelegramId();
    await say(h, stranger, "/admin");
    expect(h.lastText()).toMatch(/Connect your Proggaa account first/);

    const hero = await linkAs(h, STUDENT.id);
    for (const command of ["/admin", "/stats", "/teacher"]) {
      await say(h, hero, command);
      expect(h.lastText()).toMatch(/can't use this/);
    }
    for (const data of ["admin:stats", "admin:payments", "teacher:grading", "menu:admin"]) {
      await tap(h, hero, data);
      expect(h.lastText()).toMatch(/can't use this/);
    }
  });

  it("lets an admin in and shows the numbers", async () => {
    const h = buildTestBot();
    const admin = await linkAs(h, ADMIN.id);
    await say(h, admin, "/admin");
    expect(h.lastText()).toContain("Admin");
    await say(h, admin, "/stats");
    expect(h.lastText()).toContain("1,248");
  });

  it("gives each role its own dashboard", async () => {
    const h = buildTestBot();
    const hero = await linkAs(h, STUDENT.id);
    const mentor = await linkAs(h, TEACHER.id);
    await say(h, hero, "/dashboard");
    expect(h.lastText()).toContain("Level 4");
    expect(h.lastText()).toContain("250 Proggy Coins");
    await say(h, mentor, "/dashboard");
    expect(h.lastText()).toContain("Mentor dashboard");
  });
});

describe("payments need a confirmed admin", () => {
  it("does not approve on the first tap or for a hero, and approves only after the admin confirms", async () => {
    const h = buildTestBot();
    const admin = await linkAs(h, ADMIN.id);
    const hero = await linkAs(h, STUDENT.id);

    await tap(h, hero, "payment:approve:confirm:pay_1");
    expect(h.services.payments[0]!.status).toBe("PENDING");

    await tap(h, admin, "payment:approve:ask:pay_1");
    expect(h.services.payments[0]!.status).toBe("PENDING");

    await tap(h, admin, "payment:approve:confirm:pay_1");
    expect(h.services.payments[0]!.status).toBe("APPROVED");
  });

  it("asks for a reason before rejecting and rejects only after confirmation", async () => {
    const h = buildTestBot();
    const admin = await linkAs(h, ADMIN.id);

    await tap(h, admin, "payment:reject:ask:pay_1");
    expect(h.lastText()).toMatch(/reason/);
    expect(h.services.payments[0]!.status).toBe("PENDING");

    await say(h, admin, "TXID does not match the bKash SMS");
    expect(h.lastText()).toContain("Reject this payment?");
    expect(h.services.payments[0]!.status).toBe("PENDING");

    await tap(h, admin, "payment:reject:confirm:pay_1");
    expect(h.services.payments[0]!.status).toBe("REJECTED");
  });

  it("ignores a confirm tap that was not preceded by a reason", async () => {
    const h = buildTestBot();
    const admin = await linkAs(h, ADMIN.id);
    await tap(h, admin, "payment:reject:confirm:pay_1");
    expect(h.services.payments[0]!.status).toBe("PENDING");
    expect(h.lastText()).toMatch(/expired/);
  });

  it("does not react to tampered callback data", async () => {
    const h = buildTestBot();
    const admin = await linkAs(h, ADMIN.id);
    const before = h.sent.length;
    for (const data of ["payment:approve:confirm:../../x", "payment:approve:confirm:pay_1;DROP", `payment:approve:confirm:${"x".repeat(80)}`, "admin:groupsettings:view:abc"]) {
      await tap(h, admin, data);
    }
    expect(h.services.payments[0]!.status).toBe("PENDING");
    expect(h.sent.length).toBe(before);
  });
});

describe("screens", () => {
  it("shows live classes in Bangladesh time with a join link", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/live");
    const card = h.sent.find((m) => m.text.includes("Waves revision"));
    expect(card?.text).toContain("BST");
    expect(JSON.stringify(card?.extra)).toContain("proggaa.example/missions/course_physics");
  });

  it("escapes Mission names so Markdown cannot break the message", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/missions");
    expect(h.texts().some((t) => t.includes("Chemistry\\_Basics"))).toBe(true);
  });

  it("keeps /courses working as an alias of /missions", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/courses");
    expect(h.texts().some((t) => t.includes("Physics 1st Paper"))).toBe(true);
  });

  it("remembers which notifications a hero muted", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "settings:toggle:RESULTS");
    const prefs = await h.services.preferenceService.getPreferences(STUDENT.id);
    expect(prefs.categories.RESULTS).toBe(false);
    await tap(h, tg, "settings:toggle:NOT_A_CATEGORY");
    expect(Object.values(prefs.categories).filter((v) => !v)).toHaveLength(1);
  });

  it("tells people plainly when Proggaa is unreachable", async () => {
    const services = buildFakeContainer({
      courseService: {
        getCoursesForStudent: async () => {
          throw new ProggaaUnavailableError();
        },
        getCoursesForTeacher: async () => [],
        getTeacherAnalytics: async () => ({ totalStudents: 0, avgCourseProgress: 0, avgExamScore: 0, completionRate: 0 }),
      },
    });
    const h = buildTestBot(services);
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/missions");
    expect(h.lastText()).toMatch(/temporarily unavailable/);
  });

  it("points support at Proggaa instead of running its own tickets", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/support");
    expect(h.lastText()).toContain("Support page on Proggaa");
    expect(JSON.stringify(h.sent[h.sent.length - 1]!.extra)).toContain("proggaa.example/support");
  });
});

describe("flood protection", () => {
  it("slows down a person who sends too many updates at once", async () => {
    const h = buildTestBot();
    const tg = freshTelegramId();
    for (let i = 0; i < 20; i += 1) await say(h, tg, "/help");
    expect(h.texts().some((t) => t.includes("too quickly"))).toBe(true);
  });
});
