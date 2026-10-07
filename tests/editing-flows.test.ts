import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTestBot, callbackUpdate, linkAs, textUpdate } from "./helpers/harness";
import { ADMIN, STUDENT, TEACHER } from "./fakes";
import { parseBstDateTimeInput } from "../src/utils/time";
import { parseTaka } from "../src/bot/commands/editor";
import { adminChangeBody, builderChangeBody, mapDiscount } from "../src/services/proggaa/api/ApiEditingServices";

afterEach(() => vi.restoreAllMocks());

const calls = (h: ReturnType<typeof buildTestBot>, name: string) =>
  (h.services as unknown as { calls: { name: string; args: unknown[] }[] }).calls.filter((c) => c.name === name);

describe("Mission editor", () => {
  it("lets a Mentor rename a Mission from the chat", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, TEACHER.id);
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:m:course_physics"));
    expect(h.lastShown()).toContain("Physics 1st Paper");
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:f:course_physics:title"));
    await h.bot.handleUpdate(textUpdate(tg, tg, "Physics First Paper"));
    expect(calls(h, "builder.apply").at(-1)?.args[2]).toEqual({ op: "mission.update", title: "Physics First Paper" });
    expect(h.lastShown()).toContain("Physics First Paper");
  });

  it("asks before deleting and sends nothing on cancel", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, TEACHER.id);
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:dl:p:course_physics:pt_1"));
    expect(h.lastShown()).toContain("Delete");
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:no"));
    expect(calls(h, "builder.apply")).toHaveLength(0);

    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:dl:p:course_physics:pt_1"));
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:ok"));
    expect(calls(h, "builder.apply").at(-1)?.args[2]).toEqual({ op: "patrol.delete", patrolId: "pt_1" });
  });

  it("adds several Patrols from one message", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, TEACHER.id);
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:a:p:course_physics:ct_1"));
    await h.bot.handleUpdate(textUpdate(tg, tg, "Dot product | https://youtu.be/aaa\nCross product | https://youtu.be/bbb"));
    const change = calls(h, "builder.apply").at(-1)?.args[2] as { op: string; kind: string; parentId: string };
    expect(change).toMatchObject({ op: "bulk.add", kind: "lessons", parentId: "ct_1" });
    expect(h.texts().join("\n")).toContain("Added 2");
  });

  it("refuses Heroes", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, STUDENT.id);
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "ed:m:course_physics"));
    expect(calls(h, "builder.apply")).toHaveLength(0);
    expect(h.lastText()).not.toContain("Physics 1st Paper");
  });
});

describe("Admin tools", () => {
  it("finds an account and suspends it after confirmation", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, ADMIN.id);
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "am:user"));
    await h.bot.handleUpdate(textUpdate(tg, tg, "01700000001"));
    expect(h.lastText()).toContain("Ayesha Rahman");
    await h.bot.handleUpdate(callbackUpdate(tg, tg, `am:su:${STUDENT.id}:1`));
    expect(calls(h, "admin.apply")).toHaveLength(0);
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "am:ok"));
    expect(calls(h, "admin.apply").at(-1)?.args[1]).toEqual({ op: "user.suspend", userId: STUDENT.id, suspended: true });
    expect(h.lastShown()).toContain("suspended");
  });

  it("refuses Mentors", async () => {
    const h = buildTestBot();
    const tg = await linkAs(h, TEACHER.id);
    await h.bot.handleUpdate(callbackUpdate(tg, tg, "am:missions"));
    expect(calls(h, "admin.apply")).toHaveLength(0);
  });
});

describe("editing helpers", () => {
  it("reads Bangladesh date-times and taka", () => {
    expect(parseBstDateTimeInput("2026-10-20 19:30")).toBe("2026-10-20T19:30");
    expect(parseBstDateTimeInput("2026-02-30 10:00")).toBeNull();
    expect(parseBstDateTimeInput("tomorrow")).toBeNull();
    expect(parseTaka("৳1,200")).toBe(1200);
    expect(parseTaka("abc")).toBeNull();
  });

  it("sends poisha to the website", () => {
    expect(builderChangeBody({ op: "mission.update", priceTaka: 500 })).toEqual({ op: "mission.update", priceCents: 50000 });
    expect(adminChangeBody({ op: "discount.set", missionId: "m", amountOffTaka: 200 })).toEqual({ op: "discount.set", missionId: "m", amountOffCents: 20000 });
    expect(mapDiscount({ type: "FIXED", percentOff: null, amountOffCents: 15000, isActive: true })).toEqual({ percentOff: null, amountOffTaka: 150, isActive: true });
  });
});
