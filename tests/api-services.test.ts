import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/services/proggaa/api/ApiClient";
import {
  ApiProggaaAdminService,
  ApiProggaaCourseService,
  ApiProggaaExamService,
  ApiProggaaLiveClassService,
  ApiProggaaNotificationFeed,
  ApiProggaaPaymentService,
  ApiProggaaUserService,
} from "../src/services/proggaa/api/ApiServices";
import { ApiTelegramLinkService } from "../src/services/proggaa/api/ApiTelegramLinkService";
import {
  categoryForProggaaType,
  gradeFor,
  mapExamStatus,
  mapPayment,
  mapPaymentStatus,
  mapRole,
  mapUser,
  safeLinkPath,
} from "../src/services/proggaa/api/mappers";
import { assertProggaaConfig } from "../src/services/container";
import {
  AlreadyLinkedError,
  InvalidOrExpiredTokenError,
  NotFoundError,
  ProggaaUnavailableError,
  UnauthorizedError,
} from "../src/services/proggaa/errors";

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

describe("ApiClient", () => {
  it("sends the API key and the query string", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, []));
    await client.get("/api/bot/courses", { userId: "u1" });
    expect(calls[0]!.url.toString()).toBe("https://web.example/api/bot/courses?userId=u1");
    expect((calls[0]!.init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret-key-0123456789");
  });

  it("turns a 404 on GET into null", async () => {
    const { client } = clientWith(() => jsonResponse(404, null));
    expect(await client.get("/api/bot/courses/x")).toBeNull();
  });

  it("maps 403 to UnauthorizedError with the website's message", async () => {
    const { client } = clientWith(() => jsonResponse(403, { error: "Admin access required." }));
    await expect(client.get("/api/bot/payments/pending", { userId: "u" })).rejects.toThrow(UnauthorizedError);
    await expect(client.get("/api/bot/payments/pending", { userId: "u" })).rejects.toThrow("Admin access required.");
  });

  it("maps a network failure and a server error to ProggaaUnavailableError", async () => {
    const down = new ApiClient("https://web.example", "k", (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch);
    await expect(down.get("/x")).rejects.toThrow(ProggaaUnavailableError);

    const { client } = clientWith(() => jsonResponse(500, { error: "boom" }));
    await expect(client.get("/x")).rejects.toThrow(ProggaaUnavailableError);
  });

  it("never puts the API key in an error message", async () => {
    const { client } = clientWith(() => jsonResponse(401, { error: "Invalid or missing API key." }));
    await expect(client.get("/x")).rejects.toThrow(/rejected the bot's API key/);
    await expect(client.get("/x")).rejects.not.toThrow(/secret-key/);
  });

  it("refuses to be built without a URL or key", () => {
    expect(() => new ApiClient("", "k")).toThrow();
    expect(() => new ApiClient("https://web.example", "")).toThrow();
  });
});

describe("startup configuration", () => {
  it("requires a real key and a public address in production", () => {
    expect(() => assertProggaaConfig({ apiUrl: "https://site.example", apiKey: undefined, nodeEnv: "production" })).toThrow(/PROGGAA_API_KEY/);
    expect(() => assertProggaaConfig({ apiUrl: "https://site.example", apiKey: "short", nodeEnv: "production" })).toThrow(/too short/);
    expect(() => assertProggaaConfig({ apiUrl: "http://localhost:3000", apiKey: "k".repeat(32), nodeEnv: "production" })).toThrow(/localhost/);
    expect(() => assertProggaaConfig({ apiUrl: "http://localhost:3000", apiKey: "k".repeat(32), nodeEnv: "development" })).not.toThrow();
    expect(() => assertProggaaConfig({ apiUrl: "https://site.example", apiKey: "k".repeat(32), nodeEnv: "production" })).not.toThrow();
  });
});

describe("mappers", () => {
  it("collapses website roles to the bot's three", () => {
    expect(mapRole("SUPER_ADMIN")).toBe("ADMIN");
    expect(mapRole("ADMIN")).toBe("ADMIN");
    expect(mapRole("TEACHER")).toBe("TEACHER");
    expect(mapRole("STUDENT")).toBe("STUDENT");
    expect(mapRole("SOMETHING_ELSE")).toBe("STUDENT");
  });

  it("maps a user with level, XP, coins and streak", () => {
    const user = mapUser({ id: "u1", firstName: "Naimur", lastName: "R", role: "STUDENT", xp: 120, level: 3, xpIntoLevel: 20, xpForNextLevel: 80, streakDays: 3, coinBalance: 45 });
    expect(user).toMatchObject({ id: "u1", name: "Naimur R", role: "STUDENT", xp: 120, level: 3, xpIntoLevel: 20, xpForNextLevel: 80, streakDays: 3, coinBalance: 45 });
  });

  it("converts poisha to taka and maps payment statuses", () => {
    const payment = mapPayment({
      id: "p1", userId: "u1", status: "AWAITING_VERIFICATION", amountCents: 150000, currency: "BDT", transactionId: "ABC123XYZ",
      createdAt: "2026-10-01T10:00:00.000Z", course: { id: "c1", title: "Physics" }, user: { id: "u1", firstName: "A", lastName: "B" },
    });
    expect(payment.amount).toBe(1500);
    expect(payment.status).toBe("PENDING");
    expect(payment.studentName).toBe("A B");
    expect(mapPaymentStatus("PAID")).toBe("APPROVED");
    expect(mapPaymentStatus("EXPIRED")).toBe("REJECTED");
  });

  it("derives encounter status for live and plain exams", () => {
    const now = new Date("2026-10-01T10:00:00.000Z");
    expect(mapExamStatus({ id: "e", title: "t", liveStatus: "LIVE", monitoringEndsAt: "2026-10-01T11:00:00.000Z" }, now)).toBe("LIVE");
    expect(mapExamStatus({ id: "e", title: "t", liveStatus: "LIVE", monitoringEndsAt: "2026-10-01T10:05:00.000Z" }, now)).toBe("ENDING_SOON");
    expect(mapExamStatus({ id: "e", title: "t", liveStatus: "SCHEDULED", monitoringStartsAt: "2026-10-01T10:30:00.000Z" }, now)).toBe("STARTING_SOON");
    expect(mapExamStatus({ id: "e", title: "t", liveStatus: "CLOSED" }, now)).toBe("COMPLETED");
    expect(mapExamStatus({ id: "e", title: "t", accessClosesAt: "2026-09-30T10:00:00.000Z" }, now)).toBe("COMPLETED");
    expect(mapExamStatus({ id: "e", title: "t" }, now)).toBe("LIVE");
  });

  it("grades by percentage", () => {
    expect(gradeFor(85)).toBe("A+");
    expect(gradeFor(45)).toBe("C");
    expect(gradeFor(10)).toBe("F");
  });

  it("files every Proggaa notification type under a category, and unknown ones under SYSTEM", () => {
    expect(categoryForProggaaType("EXAM_REMINDER")).toBe("EXAM_REMINDERS");
    expect(categoryForProggaaType("LIVE_CLASS_REMINDER")).toBe("LIVE_CLASSES");
    expect(categoryForProggaaType("PAYMENT_VERIFIED")).toBe("PAYMENTS");
    expect(categoryForProggaaType("STREAK_RISK")).toBe("STREAK");
    expect(categoryForProggaaType("BRAND_NEW_TYPE")).toBe("SYSTEM");
  });

  it("only accepts plain website paths as notification links", () => {
    expect(safeLinkPath("/results/r1")).toBe("/results/r1");
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil", "", null, undefined]) {
      expect(safeLinkPath(bad as string | null | undefined)).toBeUndefined();
    }
  });
});

describe("ApiTelegramLinkService", () => {
  it("translates the website's link errors into the bot's own", async () => {
    const cases: [string, number, new () => Error][] = [
      ["EXPIRED_TOKEN", 410, InvalidOrExpiredTokenError],
      ["INVALID_TOKEN", 404, InvalidOrExpiredTokenError],
      ["USED_TOKEN", 409, InvalidOrExpiredTokenError],
      ["TELEGRAM_ALREADY_LINKED", 409, AlreadyLinkedError],
      ["USER_ALREADY_LINKED", 409, AlreadyLinkedError],
    ];
    for (const [code, status, ErrorClass] of cases) {
      const { client } = clientWith(() => jsonResponse(status, { error: "nope", code }));
      await expect(new ApiTelegramLinkService(client).linkWithToken("123", "ABCD-EFGH-JKMN")).rejects.toBeInstanceOf(ErrorClass);
    }
  });

  it("links, looks up and unlinks", async () => {
    const { client, calls } = clientWith((_url, init) => {
      if (init.method === "POST") return jsonResponse(200, { proggaaUserId: "u1", role: "TEACHER" });
      if (init.method === "DELETE") return jsonResponse(200, { ok: true });
      return jsonResponse(200, { proggaaUserId: "u1", role: "SUPER_ADMIN" });
    });
    const service = new ApiTelegramLinkService(client);

    expect(await service.linkWithToken("555", " tok ")).toEqual({ proggaaUserId: "u1", role: "TEACHER" });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ token: "tok", telegramId: "555" });
    expect(await service.getLinkedAccount("555")).toEqual({ proggaaUserId: "u1", role: "ADMIN" });
    await service.unlink("555");
    expect(calls.at(-1)?.init.method).toBe("DELETE");
  });

  it("returns null when nothing is linked", async () => {
    const { client } = clientWith(() => jsonResponse(200, null));
    expect(await new ApiTelegramLinkService(client).getLinkedAccount("1")).toBeNull();
  });
});

describe("Api services", () => {
  it("looks up a role from the user endpoint", async () => {
    const { client } = clientWith(() => jsonResponse(200, { id: "u1", firstName: "A", lastName: "B", role: "SUPER_ADMIN" }));
    expect(await new ApiProggaaUserService(client).getRole("u1")).toBe("ADMIN");
  });

  it("returns null for an unknown user", async () => {
    const { client } = clientWith(() => jsonResponse(404, { error: "Unknown or unlinked user." }));
    expect(await new ApiProggaaUserService(client).getUserById("nope")).toBeNull();
  });

  it("averages mentor analytics weighted by head count", async () => {
    const { client } = clientWith((url) => {
      if (url.pathname === "/api/bot/teacher/courses") return jsonResponse(200, [{ id: "a" }, { id: "b" }]);
      if (url.pathname.includes("/a/")) {
        return jsonResponse(200, { enrollmentCount: 30, avgProgressPct: 80, completionRatePct: 50, avgExamScorePct: 70, studentsWithGradedAttempts: 30 });
      }
      return jsonResponse(200, { enrollmentCount: 10, avgProgressPct: 40, completionRatePct: 10, avgExamScorePct: null, studentsWithGradedAttempts: 0 });
    });
    expect(await new ApiProggaaCourseService(client).getTeacherAnalytics("t1")).toEqual({ totalStudents: 40, avgCourseProgress: 70, avgExamScore: 70, completionRate: 40 });
  });

  it("lists encounters and live exams for a mentor", async () => {
    const { client, calls } = clientWith((url) =>
      url.pathname.endsWith("/live") ? jsonResponse(200, [{ examId: "e", examTitle: "t", totalStudents: 1, activeStudents: 1, submittedStudents: 0, suspiciousEvents: 0 }]) : jsonResponse(200, [{ id: "e1", title: "Mock", timeLimitSeconds: 3600, course: { id: "c", title: "Phy" } }])
    );
    const service = new ApiProggaaExamService(client);
    expect((await service.getExamsForTeacher("t1"))[0]!.durationMinutes).toBe(60);
    expect(await service.getLiveExamsForTeacher("t1")).toHaveLength(1);
    expect(calls[0]!.url.searchParams.get("teacherId")).toBe("t1");
  });

  it("maps live classes", async () => {
    const { client } = clientWith(() => jsonResponse(200, [{ id: "p1", title: "Waves", missionId: "m", missionTitle: "Physics", status: "LIVE", scheduledStart: "2026-10-02T10:00:00.000Z", scheduledEnd: "2026-10-02T12:00:00.000Z", path: "/missions/m/operations/o/chapters/c/groups/g/patrols/p1" }]));
    const [live] = await new ApiProggaaLiveClassService(client).getLiveClasses("u1");
    expect(live).toMatchObject({ id: "p1", status: "LIVE", missionTitle: "Physics" });
  });

  it("approves and rejects through the website and re-reads the payment", async () => {
    const posts: { path: string; body: unknown }[] = [];
    const { client } = clientWith((url, init) => {
      if (init.method === "POST") {
        posts.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
        return jsonResponse(200, { status: "PAID" });
      }
      return jsonResponse(200, { id: "p1", userId: "s1", status: "PAID", amountCents: 50000, currency: "BDT", createdAt: "2026-10-01T00:00:00.000Z" });
    });
    const service = new ApiProggaaPaymentService(client);

    const approved = await service.approvePayment("admin1", "p1");
    expect(approved.status).toBe("APPROVED");
    expect(posts[0]).toEqual({ path: "/api/bot/payments/p1/approve", body: { adminUserId: "admin1" } });

    await service.rejectPayment("admin1", "p1", "TXID does not match");
    expect(posts[1]!.body).toEqual({ adminUserId: "admin1", reason: "TXID does not match" });
    await service.rejectPayment("admin1", "p1");
    expect((posts[2]!.body as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("lists pending payments for an admin and refuses for a non-admin", async () => {
    const { client } = clientWith((url) => url.searchParams.get("userId") === "admin1" ? jsonResponse(200, []) : jsonResponse(403, { error: "Admin access required." }));
    const service = new ApiProggaaPaymentService(client);
    expect(await service.getPendingPayments("admin1")).toEqual([]);
    await expect(service.getPendingPayments("hero1")).rejects.toThrow(UnauthorizedError);
  });

  it("surfaces a missing payment as NotFound when re-reading after approval", async () => {
    const { client } = clientWith((_url, init) => (init.method === "POST" ? jsonResponse(200, {}) : jsonResponse(404, null)));
    await expect(new ApiProggaaPaymentService(client).approvePayment("a1", "p9")).rejects.toThrow(NotFoundError);
  });

  it("converts poisha to taka in admin statistics", async () => {
    const { client } = clientWith(() => jsonResponse(200, { studentCount: 1, teacherCount: 1, courseCount: 1, examCount: 1, liveExamCount: 0, todaysPaymentsCents: 250000, currency: "BDT" }));
    expect((await new ApiProggaaAdminService(client).getStatistics("a1")).todaysPaymentsTotal).toBe(2500);
  });

  it("reads the notification feed with a cursor", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, [{ id: "n1", userId: "u1", telegramId: "555", type: "GRADE_POSTED", title: "Graded", body: "84%", linkUrl: "/results/r1", createdAt: "2026-10-02T10:00:00.000Z" }]));
    const [item] = await new ApiProggaaNotificationFeed(client).fetchAfter({ createdAt: "2026-10-02T09:00:00.000Z", id: "n0" }, 25);
    expect(item).toMatchObject({ id: "n1", telegramId: "555", proggaaUserId: "u1", category: "RESULTS", linkPath: "/results/r1" });
    expect(calls[0]!.url.searchParams.get("after")).toBe("2026-10-02T09:00:00.000Z");
    expect(calls[0]!.url.searchParams.get("afterId")).toBe("n0");
    expect(calls[0]!.url.searchParams.get("limit")).toBe("25");
  });
});
