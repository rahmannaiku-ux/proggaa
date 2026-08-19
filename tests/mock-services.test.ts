import { describe, expect, it } from "vitest";
import { MockProggaaUserService } from "../src/services/proggaa/mock/MockProggaaUserService";
import { MockProggaaPaymentService } from "../src/services/proggaa/mock/MockProggaaPaymentService";
import { MockNotificationPreferenceService } from "../src/services/proggaa/mock/MockProggaaNotificationService";
import { ValidationError, NotFoundError } from "../src/services/proggaa/errors";

describe("MockProggaaUserService", () => {
  it("returns a known demo user", async () => {
    const service = new MockProggaaUserService();
    const user = await service.getUserById("user_student_1");
    expect(user?.role).toBe("STUDENT");
  });

  it("returns null for an unknown user id", async () => {
    const service = new MockProggaaUserService();
    const user = await service.getUserById("does_not_exist");
    expect(user).toBeNull();
  });

  it("returns the role for a known user", async () => {
    const service = new MockProggaaUserService();
    const role = await service.getRole("user_admin_1");
    expect(role).toBe("ADMIN");
  });
});

describe("MockProggaaPaymentService", () => {
  it("lists pending payments", async () => {
    const service = new MockProggaaPaymentService();
    const pending = await service.getPendingPayments();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((p) => p.status === "PENDING")).toBe(true);
  });

  it("approves a pending payment", async () => {
    const service = new MockProggaaPaymentService();
    const [payment] = await service.getPendingPayments();
    const approved = await service.approvePayment(payment.id, "user_admin_1");
    expect(approved.status).toBe("APPROVED");
  });

  it("throws NotFoundError for an unknown payment id", async () => {
    const service = new MockProggaaPaymentService();
    await expect(service.approvePayment("nope", "user_admin_1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError when approving an already-processed payment", async () => {
    // Mock data is a shared in-memory store, so make this test self-contained
    // rather than depending on execution order relative to the test above.
    const service = new MockProggaaPaymentService();
    try {
      await service.approvePayment("pay_1", "user_admin_1");
    } catch {
      // already approved by a previous test in this file — that's fine, we
      // only need it to be non-pending before the assertion below.
    }
    await expect(service.approvePayment("pay_1", "user_admin_1")).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});

describe("MockNotificationPreferenceService", () => {
  it("returns all-enabled defaults for a new user", async () => {
    const service = new MockNotificationPreferenceService();
    const prefs = await service.getPreferences("user_new_1");
    expect(Object.values(prefs.categories).every(Boolean)).toBe(true);
  });

  it("persists a toggled preference", async () => {
    const service = new MockNotificationPreferenceService();
    await service.setPreference("user_new_2", "PAYMENTS", false);
    const prefs = await service.getPreferences("user_new_2");
    expect(prefs.categories.PAYMENTS).toBe(false);
    expect(prefs.categories.RESULTS).toBe(true);
  });
});
