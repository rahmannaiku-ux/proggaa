import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/services/proggaa/api/ApiClient";
import {
  ApiProggaaCatalogService,
  ApiProggaaCommunityService,
  ApiProggaaLearningService,
  ApiProggaaMentorToolsService,
  ApiProggaaStoreService,
} from "../src/services/proggaa/api/ApiServices";
import { UnauthorizedError } from "../src/services/proggaa/errors";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clientWith(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  });
  const client = new ApiClient("https://web.example", "secret-key-0123456789", fetchMock as unknown as typeof fetch, 500);
  return { client, calls };
}

describe("learning", () => {
  it("reads a Mission, an Operation and a Patrol, and treats a locked Patrol as a refusal", async () => {
    const { client, calls } = clientWith((url) => {
      if (url.pathname.startsWith("/api/bot/missions/")) {
        return jsonResponse(200, { id: "m1", title: "Physics", isFree: false, enrolled: true, progressPct: 49.6, operations: [{ id: "o1", title: "Vectors", patrolCount: 2, completedCount: 1 }], resume: { patrolId: "p2", title: "Dot product" } });
      }
      if (url.pathname.startsWith("/api/bot/operations/")) {
        return jsonResponse(200, { id: "o1", title: "Vectors", missionId: "m1", missionTitle: "Physics", chapters: [] });
      }
      if (url.pathname === "/api/bot/patrols/locked") return jsonResponse(403, { error: "This Patrol is locked.", code: "LOCKED" });
      return jsonResponse(200, { id: "p2", title: "Dot product", description: null, durationSeconds: 900, isLive: false, scheduledStart: null, missionId: "m1", missionTitle: "Physics", operationId: "o1", operationTitle: "Vectors", completed: false, watchedSeconds: 0, resources: [], notes: [], previous: null, next: null, path: "https://evil.example/x" });
    });
    const service = new ApiProggaaLearningService(client);

    expect(await service.getMission("u1", "m1")).toMatchObject({ progressPercent: 50, resume: { patrolId: "p2" } });
    expect((await service.getOperation("u1", "o1"))?.missionTitle).toBe("Physics");
    // A link target that is not a plain path on Proggaa is never used.
    expect((await service.getPatrol("u1", "p2"))?.path).toBe("/dashboard");
    await expect(service.getPatrol("u1", "locked")).rejects.toThrow(UnauthorizedError);
    expect(calls[0]!.url.searchParams.get("userId")).toBe("u1");
  });

  it("sends a note with the hero's id", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { ok: true }));
    await new ApiProggaaLearningService(client).addNote("u1", "p2", "remember this");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ userId: "u1", text: "remember this" });
    expect(calls[0]!.url.pathname).toBe("/api/bot/patrols/p2/note");
  });
});

describe("catalog and checkout", () => {
  it("browses the catalog in taka and starts a checkout with a coupon", async () => {
    const { client, calls } = clientWith((url) =>
      url.pathname === "/api/bot/catalog"
        ? jsonResponse(200, { page: 1, pageSize: 6, total: 1, missions: [{ id: "c1", title: "Chem", level: "BEGINNER", isFree: false, priceCents: 100000, finalPriceCents: 80000, durationMinutes: 60, mentorName: "K H", enrolled: false }] })
        : jsonResponse(200, { id: "pay9", status: "PENDING", amountCents: 80000, currency: "BDT", paymentReference: "PRG-ABC", receivingNumber: "017", mfsProvider: "BKASH", couponCode: "SAVE", courseTitle: "Chem" })
    );
    const service = new ApiProggaaCatalogService(client);

    const page = await service.browse("u1", { query: "ch", page: 2 });
    expect(page.missions[0]).toMatchObject({ price: 1000, finalPrice: 800 });
    expect(calls[0]!.url.searchParams.get("q")).toBe("ch");
    expect(calls[0]!.url.searchParams.get("page")).toBe("2");

    const checkout = await service.checkout("u1", "c1", "SAVE");
    expect(checkout).toMatchObject({ paymentId: "pay9", amount: 800, reference: "PRG-ABC", receivingNumber: "017", fullyDiscounted: false });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ userId: "u1", couponCode: "SAVE" });
  });

  it("marks a checkout with nothing left to pay as fully discounted", async () => {
    const { client } = clientWith(() => jsonResponse(200, { id: "pay9", status: "AWAITING_VERIFICATION", amountCents: 0, currency: "BDT", paymentReference: "PRG-ABC" }));
    expect((await new ApiProggaaCatalogService(client).checkout("u1", "c1", "FREE")).fullyDiscounted).toBe(true);
  });

  it("surfaces Proggaa's own refusal text for a bad coupon or Transaction ID", async () => {
    const { client } = clientWith(() => jsonResponse(409, { error: "That coupon is not valid." }));
    const service = new ApiProggaaCatalogService(client);
    await expect(service.checkout("u1", "c1", "BAD")).rejects.toThrow("That coupon is not valid.");
    await expect(service.submitTransactionId("u1", "pay9", "ABC123XYZ")).rejects.toThrow("That coupon is not valid.");
  });
});

describe("store, community and Mentor tools", () => {
  it("buys from the store and reports the item", async () => {
    const { client, calls } = clientWith((url) =>
      url.pathname.endsWith("/purchase") ? jsonResponse(200, { ok: true, itemTitle: "Formula sheet" }) : jsonResponse(200, { coinBalance: 250, items: [] })
    );
    const service = new ApiProggaaStoreService(client);
    expect((await service.getStore("u1")).coinBalance).toBe(250);
    expect(await service.purchase("u1", "item1")).toEqual({ itemTitle: "Formula sheet" });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ userId: "u1", itemId: "item1" });
  });

  it("maps the calendar, leaderboard, Medals and announcements", async () => {
    const { client } = clientWith((url) => {
      if (url.pathname.endsWith("/calendar")) {
        return jsonResponse(200, [
          { id: "c", kind: "live_class", title: "Waves", startAt: "2026-10-02T10:00:00.000Z", path: "/missions/m1", missionTitle: "Physics" },
          { id: "d", kind: "event", title: "Bad link", startAt: "2026-10-02T11:00:00.000Z", path: "https://evil.example" },
        ]);
      }
      if (url.pathname.endsWith("/leaderboard")) return jsonResponse(200, { schedule: "WEEKLY", top: [{ rank: 1, userId: "u", name: "A B", xp: 5, level: 1, streakDays: 0 }], me: null });
      if (url.pathname.endsWith("/medals")) return jsonResponse(200, [{ id: "m", missionTitle: "Physics", issuedAt: "2026-10-01T00:00:00.000Z", verifyPath: "/certificates/verify/X" }]);
      return jsonResponse(200, [{ id: "a", title: "Hi", body: "There", missionTitle: null, createdAt: "2026-10-01T00:00:00.000Z" }]);
    });
    const service = new ApiProggaaCommunityService(client);
    const [first, second] = await service.getCalendar("u1");
    expect(first).toMatchObject({ kind: "live_class", path: "/missions/m1" });
    expect(second!.path).toBeUndefined();
    expect((await service.getLeaderboard("u1")).schedule).toBe("WEEKLY");
    expect((await service.getMedals("u1"))[0]!.verifyPath).toBe("/certificates/verify/X");
    expect((await service.getAnnouncements("u1"))[0]!.title).toBe("Hi");
  });

  it("sends Mentor tool requests with the mentor's own id", async () => {
    const { client, calls } = clientWith((url, init) => {
      const action = JSON.parse(String(init.body)).action;
      if (url.pathname.endsWith("/announcements")) return jsonResponse(200, { ok: true });
      return jsonResponse(200, action === "grant" ? { ok: true, studentLabel: "Hero One", alreadyEnrolled: false } : { ok: true, studentLabel: "Hero One", alreadyIssued: true });
    });
    const service = new ApiProggaaMentorToolsService(client);
    await service.announce("t1", "m1", "Title", "Body");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ mentorId: "t1", missionId: "m1", title: "Title", body: "Body" });
    expect(await service.grantAccess("t1", "m1", "hero@example.com")).toEqual({ heroLabel: "Hero One", alreadyEnrolled: false });
    expect(await service.issueMedal("t1", "m1", "hero@example.com")).toEqual({ heroLabel: "Hero One", alreadyIssued: true });
    expect(JSON.parse(String(calls[2]!.init.body))).toMatchObject({ mentorId: "t1", action: "medal", identifier: "hero@example.com" });
  });
});
