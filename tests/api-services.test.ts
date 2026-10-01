import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/services/proggaa/api/ApiClient";
import {
  ApiProggaaCourseService,
  ApiProggaaExamService,
  ApiProggaaPaymentService,
  ApiProggaaUserService,
} from "../src/services/proggaa/api/ApiServices";
import { ApiTelegramLinkService } from "../src/services/proggaa/api/ApiTelegramLinkService";
import {
  gradeFor,
  mapExamStatus,
  mapNotification,
  mapPayment,
  mapPaymentStatus,
  mapRole,
  mapUser,
} from "../src/services/proggaa/api/mappers";
import {
  AlreadyLinkedError,
  InvalidOrExpiredTokenError,
  NotFoundError,
  ProggaaUnavailableError,
  UnauthorizedError,
} from "../src/services/proggaa/errors";
import {
  ProggaaEventReceiver,
  escapeMarkdown,
  toNotificationEvent,
  verifySignature,
} from "../src/services/events/ProggaaEventReceiver";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clientWith(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  });
  const client = new ApiClient("https://web.example", "secret-key", fetchMock as unknown as typeof fetch, 500);
  return { client, calls };
}

describe("ApiClient", () => {
  it("sends the API key and the query string", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, []));
    await client.get("/api/bot/courses", { userId: "u1" });
    expect(calls[0].url.toString()).toBe("https://web.example/api/bot/courses?userId=u1");
    expect((calls[0].init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret-key");
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

  it("refuses to be built without a URL or key", () => {
    expect(() => new ApiClient("", "k")).toThrow();
    expect(() => new ApiClient("https://web.example", "")).toThrow();
  });
});

describe("mappers", () => {
  it("collapses website roles to the bot's three", () => {
    expect(mapRole("SUPER_ADMIN")).toBe("ADMIN");
    expect(mapRole("ADMIN")).toBe("ADMIN");
    expect(mapRole("TEACHER")).toBe("TEACHER");
    expect(mapRole("STUDENT")).toBe("STUDENT");
  });

  it("maps a user with xp and streak", () => {
    const user = mapUser({ id: "u1", firstName: "Naimur", lastName: "R", role: "STUDENT", xp: 120, streakDays: 3 });
    expect(user).toMatchObject({ id: "u1", name: "Naimur R", role: "STUDENT", xp: 120, streakDays: 3 });
  });

  it("converts poisha to taka and maps payment statuses", () => {
    const payment = mapPayment({
      id: "p1",
      userId: "u1",
      status: "AWAITING_VERIFICATION",
      amountCents: 150000,
      currency: "BDT",
      transactionId: "ABC123XYZ",
      createdAt: "2026-10-01T10:00:00.000Z",
      course: { id: "c1", title: "Physics" },
      user: { id: "u1", firstName: "A", lastName: "B" },
    });
    expect(payment.amount).toBe(1500);
    expect(payment.status).toBe("PENDING");
    expect(payment.studentName).toBe("A B");
    expect(mapPaymentStatus("PAID")).toBe("APPROVED");
    expect(mapPaymentStatus("EXPIRED")).toBe("REJECTED");
  });

  it("derives exam status for live and plain exams", () => {
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

  it("gives unknown notification types a safe category", () => {
    const n = mapNotification({ id: "n1", type: "SOMETHING_NEW", title: "t", body: "b", createdAt: "2026-10-01T00:00:00.000Z" }, "u1");
    expect(n.category).toBe("SYSTEM_ALERTS");
    expect(n.type).toBe("SYSTEM_NOTICE");
  });
});

describe("ApiTelegramLinkService", () => {
  it("translates the website's link errors into the bot's own", async () => {
    const codes: Record<string, unknown> = {
      EXPIRED_TOKEN: InvalidOrExpiredTokenError,
      INVALID_TOKEN: InvalidOrExpiredTokenError,
      USED_TOKEN: InvalidOrExpiredTokenError,
      TELEGRAM_ALREADY_LINKED: AlreadyLinkedError,
    };
    for (const [code, ErrorClass] of Object.entries(codes)) {
      const status = code === "INVALID_TOKEN" ? 404 : code === "EXPIRED_TOKEN" ? 410 : 409;
      const { client } = clientWith(() => jsonResponse(status, { error: "nope", code }));
      const service = new ApiTelegramLinkService(client);
      await expect(service.linkWithToken("123", "abc")).rejects.toBeInstanceOf(ErrorClass as new () => Error);
    }
  });

  it("links, looks up both ways and unlinks", async () => {
    const { client, calls } = clientWith((url, init) => {
      if (init.method === "POST") return jsonResponse(200, { proggaaUserId: "u1", role: "TEACHER" });
      if (init.method === "DELETE") return jsonResponse(200, { ok: true });
      if (url.searchParams.get("proggaaUserId")) return jsonResponse(200, { telegramId: "555" });
      return jsonResponse(200, { proggaaUserId: "u1", role: "SUPER_ADMIN" });
    });
    const service = new ApiTelegramLinkService(client);

    expect(await service.linkWithToken("555", " tok ")).toEqual({ proggaaUserId: "u1", role: "TEACHER" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: "tok", telegramId: "555" });
    expect(await service.getLinkedAccount("555")).toEqual({ proggaaUserId: "u1", role: "ADMIN" });
    expect(await service.getTelegramIdForProggaaUser("u1")).toBe("555");
    await service.unlink("555");
    expect(calls.at(-1)?.init.method).toBe("DELETE");
  });

  it("returns null when nothing is linked", async () => {
    const { client } = clientWith(() => jsonResponse(200, null));
    const service = new ApiTelegramLinkService(client);
    expect(await service.getLinkedAccount("1")).toBeNull();
    expect(await service.getTelegramIdForProggaaUser("u")).toBeNull();
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

  it("lists a student's courses with their progress", async () => {
    const { client } = clientWith(() => jsonResponse(200, [{ id: "c1", title: "Physics", progressPct: 41.6 }]));
    expect(await new ApiProggaaCourseService(client).getCoursesForStudent("u1")).toEqual([
      { id: "c1", name: "Physics", progressPercent: 42 },
    ]);
  });

  it("averages teacher analytics weighted by head count", async () => {
    const { client } = clientWith((url) => {
      if (url.pathname === "/api/bot/teacher/courses") return jsonResponse(200, [{ id: "a" }, { id: "b" }]);
      if (url.pathname.includes("/a/")) {
        return jsonResponse(200, { enrollmentCount: 30, avgProgressPct: 80, completionRatePct: 50, avgExamScorePct: 70, studentsWithGradedAttempts: 30 });
      }
      return jsonResponse(200, { enrollmentCount: 10, avgProgressPct: 40, completionRatePct: 10, avgExamScorePct: null, studentsWithGradedAttempts: 0 });
    });
    expect(await new ApiProggaaCourseService(client).getTeacherAnalytics("t1")).toEqual({
      totalStudents: 40,
      avgCourseProgress: 70,
      avgExamScore: 70,
      completionRate: 40,
    });
  });

  it("only shows an exam to a signed-in student", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { id: "e1", title: "Mock", timeLimitSeconds: 3600, course: { id: "c", title: "Phy" } }));
    const service = new ApiProggaaExamService(client);
    expect(await service.getExamById("e1")).toBeNull();
    expect(calls).toHaveLength(0);
    expect((await service.getExamById("e1", "u1"))?.durationMinutes).toBe(60);
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

    const approved = await service.approvePayment("p1", "admin1");
    expect(approved.status).toBe("APPROVED");
    expect(posts[0]).toEqual({ path: "/api/bot/payments/p1/approve", body: { adminUserId: "admin1" } });

    await service.rejectPayment("p1", "admin1");
    expect(posts[1].body).toMatchObject({ adminUserId: "admin1" });
    expect((posts[1].body as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("says plainly that TXIDs are submitted on the website", async () => {
    const { client } = clientWith(() => jsonResponse(200, {}));
    await expect(new ApiProggaaPaymentService(client).submitTransactionId()).rejects.toThrow(/website/);
  });

  it("does not list pending payments without an admin id", async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, []));
    expect(await new ApiProggaaPaymentService(client).getPendingPayments()).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a missing payment as NotFound when re-reading after approval", async () => {
    const { client } = clientWith((_url, init) => (init.method === "POST" ? jsonResponse(200, {}) : jsonResponse(404, null)));
    await expect(new ApiProggaaPaymentService(client).approvePayment("p9", "a1")).rejects.toThrow();
    void NotFoundError;
  });
});

describe("ProggaaEventReceiver", () => {
  const secret = "test-webhook-secret";
  const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");
  const envelope = (eventId = "evt1") =>
    JSON.stringify({
      eventId,
      sentAt: "2026-10-01T10:00:00.000Z",
      event: { type: "PAYMENT_APPROVED", proggaaUserId: "u1", payload: { paymentId: "p1", courseTitle: "Physics_1st" } },
    });

  function receiver() {
    const dispatch = vi.fn(async () => undefined);
    const notifications = { dispatch, getRecentNotifications: vi.fn(async () => []) };
    return { dispatch, receiver: new ProggaaEventReceiver(notifications, secret) };
  }

  it("verifies signatures in constant time and rejects anything else", () => {
    const body = envelope();
    expect(verifySignature(body, sign(body), secret)).toBe(true);
    expect(verifySignature(body, sign(body + "x"), secret)).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, "short", secret)).toBe(false);
  });

  it("rejects a bad signature without dispatching", async () => {
    const { receiver: r, dispatch } = receiver();
    expect((await r.handle(envelope(), "bad")).status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches a signed event once, even if the website retries it", async () => {
    const { receiver: r, dispatch } = receiver();
    const body = envelope("evt-42");
    expect((await r.handle(body, sign(body))).status).toBe(200);
    expect((await r.handle(body, sign(body))).status).toBe(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "PAYMENT_APPROVED", userId: "u1", category: "PAYMENTS" }));
  });

  it("answers 503 when no secret is configured and 400 for malformed bodies", async () => {
    const off = new ProggaaEventReceiver({ dispatch: vi.fn(), getRecentNotifications: vi.fn() }, undefined);
    expect((await off.handle("{}", "x")).status).toBe(503);

    const { receiver: r } = receiver();
    const bad = "not json";
    expect((await r.handle(bad, sign(bad))).status).toBe(400);
    const empty = JSON.stringify({ eventId: "e" });
    expect((await r.handle(empty, sign(empty))).status).toBe(400);
  });

  it("does not let a failing push make the website retry", async () => {
    const dispatch = vi.fn(async () => {
      throw new Error("telegram down");
    });
    const r = new ProggaaEventReceiver({ dispatch, getRecentNotifications: vi.fn() }, secret);
    const body = envelope("evt-fail");
    expect((await r.handle(body, sign(body))).status).toBe(200);
  });

  it("escapes Markdown in course names so Telegram does not reject the message", () => {
    expect(escapeMarkdown("Physics_1st *Paper*")).toBe("Physics\\_1st \\*Paper\\*");
    const event = toNotificationEvent({
      type: "PAYMENT_REJECTED",
      proggaaUserId: "u1",
      payload: { paymentId: "p", courseTitle: "A_B", reason: "bad_txid" },
    });
    expect(event.body).toBe("A\\_B: bad\\_txid");
  });

  it("picks the reminder type from how soon an exam starts", () => {
    const at = (m: number) =>
      toNotificationEvent({ type: "EXAM_STARTING", proggaaUserId: "u", payload: { assessmentId: "a", title: "T", startsInMinutes: m } }).type;
    expect(at(5)).toBe("EXAM_REMINDER_10_MIN");
    expect(at(45)).toBe("EXAM_REMINDER_1_HOUR");
    expect(at(600)).toBe("EXAM_REMINDER_1_DAY");
  });
});
