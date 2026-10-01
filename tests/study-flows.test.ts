import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN, STUDENT, TEACHER } from "./fakes";
import { buildTestBot, callbackUpdate, linkAs, textUpdate } from "./helpers/harness";

afterEach(() => vi.restoreAllMocks());

type Harness = ReturnType<typeof buildTestBot>;
const say = (h: Harness, tg: number, text: string) => h.bot.handleUpdate(textUpdate(tg, tg, text));
const tap = (h: Harness, tg: number, data: string) => h.bot.handleUpdate(callbackUpdate(tg, tg, data));
/** Everything the bot showed, in order, whether as a new message or an edit of the one tapped. */
const shown = (h: Harness) => h.log.map((l) => l.text).join(" ~~~ ");
const lastShown = (h: Harness) => h.lastShown();
const buttons = (h: Harness) => JSON.stringify(h.log.map((l) => l.extra?.reply_markup));

describe("studying a Mission from Telegram", () => {
  it("opens a Mission, then an Operation, then a Patrol", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);

    await tap(h, tg, "m:course_physics");
    expect(shown(h)).toContain("Physics 1st Paper");
    expect(shown(h)).toContain("Vectors");
    expect(shown(h)).toContain("50%");

    await tap(h, tg, "o:op_vectors");
    const operation = shown(h);
    expect(operation).toContain("Intro\\_to vectors"); // Markdown-safe
    expect(operation).toContain("Foundation Class");

    await tap(h, tg, "pt:pt_2");
    expect(shown(h)).toContain("Dot product");
    expect(shown(h)).toContain("Slides.pdf");
  });

  it("sends people to Proggaa to watch, and never exposes a video link", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "pt:pt_2");
    const everything = JSON.stringify([h.log, h.answers]);
    expect(everything).toContain("proggaa.example/missions/course_physics/operations/op_vectors/chapters/ch_1/groups/g_1/patrols/pt_2");
    expect(everything).not.toMatch(/youtu\.?be|youtube/i);
  });

  it("explains a locked Patrol instead of failing", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "pt:pt_3");
    expect(lastShown(h)).toMatch(/locked/i);
  });

  it("saves a note on a Patrol only after the hero writes it", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "note:pt_2");
    expect(h.services.calls.filter((c) => c.name === "addNote")).toHaveLength(0);
    await say(h, tg, "  dot product is commutative  ");
    expect(h.services.calls.find((c) => c.name === "addNote")?.args).toEqual([STUDENT.id, "pt_2", "dot product is commutative"]);
    expect(lastShown(h)).toContain("Note saved");
  });

  it("ignores buttons with a tampered id", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    const before = h.sent.length + h.edits.length;
    for (const data of ["m:../../etc", "o:a b", "pt:" + "x".repeat(80), "note:id;drop"]) await tap(h, tg, data);
    expect(h.sent.length + h.edits.length).toBe(before);
  });

  it("does not open Missions in a group chat", async () => {
    const h = buildTestBot();
    await h.bot.handleUpdate(callbackUpdate(1234, -100123456789, "m:course_physics", "group"));
    expect(h.answers.some((a) => a.text?.includes("private chat"))).toBe(true);
    expect(shown(h)).not.toContain("Vectors");
  });
});

describe("browsing, joining and paying", () => {
  it("lists Missions with their price and shows a discount", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/browse");
    expect(shown(h)).toContain("৳800");
    expect(shown(h)).toContain("was ৳1,000");
    expect(shown(h)).toContain("Free");
  });

  it("searches by name", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/search study");
    expect(shown(h)).toContain("Study skills");
    expect(shown(h)).not.toContain("Chemistry");
  });

  it("joins a free Mission with one tap", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "cat:m:course_free");
    expect(buttons(h)).toContain("cat:enroll:course_free");
    await tap(h, tg, "cat:enroll:course_free");
    expect(h.services.calls.find((c) => c.name === "enrollFree")?.args).toEqual([STUDENT.id, "course_free"]);
    expect(lastShown(h)).toContain("You're in");
  });

  it("pays for a Mission: coupon, instructions, then the Transaction ID", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);

    await tap(h, tg, "cat:buy:course_chem");
    expect(h.services.calls.filter((c) => c.name === "checkout")).toHaveLength(0); // nothing started yet
    await say(h, tg, "SAVE20");
    const checkout = h.services.calls.find((c) => c.name === "checkout")!;
    expect(checkout.args).toEqual([STUDENT.id, "course_chem", "SAVE20"]);
    expect(lastShown(h)).toContain("01700000000");
    expect(lastShown(h)).toContain("PRG-ABC123");
    expect(lastShown(h)).toContain("৳500");

    await tap(h, tg, "pay:txid:pay_new");
    await say(h, tg, "not a txid!");
    expect(h.services.calls.filter((c) => c.name === "submitTransactionId")).toHaveLength(0);
    await say(h, tg, "bk12ab34cd");
    expect(h.services.calls.find((c) => c.name === "submitTransactionId")?.args).toEqual([STUDENT.id, "pay_new", "BK12AB34CD"]);
    expect(lastShown(h)).toContain("waiting for verification");
  });

  it("continues without a coupon, and tells a hero when a coupon is not valid", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);

    await tap(h, tg, "cat:buy:course_chem");
    await say(h, tg, "BAD");
    expect(lastShown(h)).toContain("That coupon isn't valid");

    await tap(h, tg, "cat:go:course_chem");
    expect(h.services.calls.filter((c) => c.name === "checkout").pop()?.args).toEqual([STUDENT.id, "course_chem", undefined]);
    expect(lastShown(h)).toContain("৳800");
  });

  it("says a 100% coupon unlocked the Mission, with no payment steps", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "cat:buy:course_chem");
    await say(h, tg, "FREE100");
    expect(lastShown(h)).toContain("covered the whole price");
    expect(lastShown(h)).not.toContain("Send Money");
  });

  it("offers to send the Transaction ID only while one is still missing", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);

    await tap(h, tg, "mypayment:view:pay_1"); // this one already has a Transaction ID
    expect(buttons(h)).not.toContain("pay:txid:pay_1");

    h.services.payments[0]!.transactionId = "";
    h.services.payments[0]!.reference = "PRG-XYZ789";
    h.services.payments[0]!.receivingNumber = "01711111111";
    await tap(h, tg, "mypayment:view:pay_1");
    expect(buttons(h)).toContain("pay:txid:pay_1");
    expect(h.lastShown()).toContain("PRG-XYZ789");
    expect(h.lastShown()).toContain("01711111111");
  });
});

describe("the Proggy Store", () => {
  it("shows the balance and what each item costs", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/store");
    expect(shown(h)).toContain("250");
    expect(shown(h)).toContain("Formula sheet");
  });

  it("asks for confirmation and spends coins only after it", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "st:buy:item_pdf");
    expect(h.services.calls.filter((c) => c.name === "purchase")).toHaveLength(0);
    expect(lastShown(h)).toContain("Spend");
    await tap(h, tg, "st:ok:item_pdf");
    expect(h.services.calls.find((c) => c.name === "purchase")?.args).toEqual([STUDENT.id, "item_pdf"]);
    expect(lastShown(h)).toContain("is yours");
  });

  it("does not offer a purchase the hero cannot afford, and reports a refused one", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await tap(h, tg, "st:i:item_big");
    expect(buttons(h)).not.toContain("st:buy:item_big");
    expect(lastShown(h)).toContain("650 more");

    await tap(h, tg, "st:ok:item_big");
    expect(lastShown(h)).toContain("enough Proggy Coins");
  });
});

describe("calendar, leaderboard, Medals and announcements", () => {
  it("shows the calendar in Bangladesh time", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/calendar");
    expect(shown(h)).toContain("Waves revision");
    expect(shown(h)).toMatch(/Bangladesh time/);
  });

  it("shows the leaderboard and marks the hero", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/leaderboard");
    expect(shown(h)).toContain("Top Hero");
    expect(shown(h)).toContain("← you");
  });

  it("lists Medals with a verification link, and announcements", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await say(h, tg, "/medals");
    expect(JSON.stringify(h.sent)).toContain("proggaa.example/certificates/verify/ABC-123");
    await say(h, tg, "/announcements");
    expect(shown(h)).toContain("Class moved");
  });
});

describe("Mentor tools", () => {
  it("keep heroes out", async () => {
    const h = buildTestBot();
    const hero = await linkAs(h, STUDENT.id);
    for (const data of ["tool:announce", "tool:grant", "tool:medal", "toolm:announce:course_physics", "tool:confirm"]) {
      await tap(h, hero, data);
      expect(lastShown(h)).toMatch(/can't use this/);
    }
    expect(h.services.calls).toHaveLength(0);
  });

  it("announce to a Mission only after a preview and a confirming tap", async () => {
    const h = buildTestBot();
    const mentor = await linkAs(h, TEACHER.id);

    await tap(h, mentor, "tool:announce");
    await tap(h, mentor, "toolm:announce:course_physics");
    await say(h, mentor, "Class moved");
    await say(h, mentor, "Tomorrow at 5pm.");
    expect(lastShown(h)).toContain("Preview");
    expect(h.services.calls.filter((c) => c.name === "announce")).toHaveLength(0);

    await tap(h, mentor, "tool:confirm");
    expect(h.services.calls.find((c) => c.name === "announce")?.args).toEqual([TEACHER.id, "course_physics", "Class moved", "Tomorrow at 5pm."]);
    expect(lastShown(h)).toContain("Announcement sent");
  });

  it("can be cancelled, and a stale confirm does nothing", async () => {
    const h = buildTestBot();
    const mentor = await linkAs(h, ADMIN.id);
    await tap(h, mentor, "toolm:grant:course_physics");
    await say(h, mentor, "new.hero@example.com");
    await tap(h, mentor, "tool:cancel");
    await tap(h, mentor, "tool:confirm");
    expect(h.services.calls).toHaveLength(0);
    expect(lastShown(h)).toMatch(/expired/);
  });

  it("grants access and issues a Medal after confirmation", async () => {
    const h = buildTestBot();
    const mentor = await linkAs(h, TEACHER.id);

    await tap(h, mentor, "toolm:grant:course_physics");
    await say(h, mentor, "hero@example.com");
    await tap(h, mentor, "tool:confirm");
    expect(h.services.calls.find((c) => c.name === "grantAccess")?.args).toEqual([TEACHER.id, "course_physics", "hero@example.com"]);

    await tap(h, mentor, "toolm:medal:course_physics");
    await say(h, mentor, "hero@example.com");
    await tap(h, mentor, "tool:confirm");
    expect(h.services.calls.find((c) => c.name === "issueMedal")?.args).toEqual([TEACHER.id, "course_physics", "hero@example.com"]);
  });

  it("only offers Missions the mentor teaches", async () => {
    const h = buildTestBot();
    const mentor = await linkAs(h, TEACHER.id);
    await tap(h, mentor, "toolm:announce:someone_elses_mission");
    expect(lastShown(h)).toContain("among yours");
    expect(h.services.calls).toHaveLength(0);
  });
});
