import { describe, expect, it, vi } from "vitest";
import { startWizard, isWizardExpired, clearWizard } from "../src/bot/handlers/wizard";
import type { ProggaaBotContext } from "../src/types/session";
import {
  examScheduled,
  achievementUnlocked,
  paymentApproved,
  teacherManualGradingRequired,
} from "../src/services/notifications/notificationBuilders";

function fakeCtx(): ProggaaBotContext {
  return { session: {} } as unknown as ProggaaBotContext;
}

describe("wizard session helpers", () => {
  it("is not expired immediately after starting", () => {
    const ctx = fakeCtx();
    startWizard(ctx, "support", "awaiting_message", { category: "BUG_REPORT" });
    expect(isWizardExpired(ctx)).toBe(false);
  });

  it("expires after the TTL and clears itself", () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    startWizard(ctx, "ai", "awaiting_topic", { flow: "MCQ" });

    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(isWizardExpired(ctx)).toBe(true);
    expect(ctx.session.wizard).toBeUndefined();
    vi.useRealTimers();
  });

  it("clearWizard removes the wizard state", () => {
    const ctx = fakeCtx();
    startWizard(ctx, "support", "awaiting_message", {});
    clearWizard(ctx);
    expect(ctx.session.wizard).toBeUndefined();
  });
});

describe("notification builders", () => {
  it("builds an exam scheduled event with the exam reminders category", () => {
    const event = examScheduled("user_1", "Physics Midterm", "exam_1", "7:00 PM");
    expect(event.category).toBe("EXAM_REMINDERS");
    expect(event.type).toBe("EXAM_SCHEDULED");
    expect(event.data?.examId).toBe("exam_1");
  });

  it("builds an achievement unlocked event with XP in the body", () => {
    const event = achievementUnlocked("user_1", "Perfect Score", 100);
    expect(event.category).toBe("ACHIEVEMENTS");
    expect(event.body).toContain("+100 XP");
  });

  it("builds a payment approved event tied to the payment id", () => {
    const event = paymentApproved("user_1", "HSC Physics", "pay_1");
    expect(event.category).toBe("PAYMENTS");
    expect(event.data?.paymentId).toBe("pay_1");
  });

  it("builds a teacher manual grading required event with the correct count", () => {
    const event = teacherManualGradingRequired("teacher_1", "Physics Midterm", "exam_1", 27);
    expect(event.category).toBe("TEACHER_ALERTS");
    expect(event.body).toContain("27 answers");
  });
});
