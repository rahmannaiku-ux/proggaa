import { describe, expect, it, vi } from "vitest";
import { MockTelegramLinkService } from "../src/services/linking/mock/MockTelegramLinkService";
import {
  AccountMismatchError,
  AlreadyLinkedError,
  InvalidOrExpiredTokenError,
} from "../src/services/proggaa/errors";

describe("MockTelegramLinkService", () => {
  it("returns null for an unlinked telegram id", async () => {
    const service = new MockTelegramLinkService();
    const result = await service.getLinkedAccount("tg_unlinked_1");
    expect(result).toBeNull();
  });

  it("links a telegram id with a valid one-time token", async () => {
    const service = new MockTelegramLinkService();
    const token = MockTelegramLinkService.devIssueToken("user_student_1");

    const result = await service.linkWithToken("tg_test_1", token);

    expect(result.proggaaUserId).toBe("user_student_1");
    expect(result.role).toBe("STUDENT");

    const linked = await service.getLinkedAccount("tg_test_1");
    expect(linked?.proggaaUserId).toBe("user_student_1");
  });

  it("rejects an invalid token", async () => {
    const service = new MockTelegramLinkService();
    await expect(service.linkWithToken("tg_test_2", "NOT-A-REAL-TOKEN")).rejects.toBeInstanceOf(
      InvalidOrExpiredTokenError
    );
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const service = new MockTelegramLinkService();
    const token = MockTelegramLinkService.devIssueToken("user_student_1");

    vi.advanceTimersByTime(11 * 60 * 1000); // past the 10 minute TTL

    await expect(service.linkWithToken("tg_test_3", token)).rejects.toBeInstanceOf(
      InvalidOrExpiredTokenError
    );
    vi.useRealTimers();
  });

  it("prevents linking twice for the same telegram id", async () => {
    const service = new MockTelegramLinkService();
    const token1 = MockTelegramLinkService.devIssueToken("user_student_1");
    await service.linkWithToken("tg_test_4", token1);

    const token2 = MockTelegramLinkService.devIssueToken("user_teacher_1");
    await expect(service.linkWithToken("tg_test_4", token2)).rejects.toBeInstanceOf(AlreadyLinkedError);
  });

  it("rejects a token restricted to a different telegram id", async () => {
    const service = new MockTelegramLinkService();
    const token = MockTelegramLinkService.devIssueToken("user_student_1", "tg_owner_only");

    await expect(service.linkWithToken("tg_someone_else", token)).rejects.toBeInstanceOf(
      AccountMismatchError
    );
  });

  it("consumes a token after one use (cannot be replayed)", async () => {
    const service = new MockTelegramLinkService();
    const token = MockTelegramLinkService.devIssueToken("user_student_1");

    await service.linkWithToken("tg_test_5", token);
    await service.unlink("tg_test_5");

    await expect(service.linkWithToken("tg_test_6", token)).rejects.toBeInstanceOf(
      InvalidOrExpiredTokenError
    );
  });

  it("unlink removes the association", async () => {
    const service = new MockTelegramLinkService();
    const token = MockTelegramLinkService.devIssueToken("user_student_1");
    await service.linkWithToken("tg_test_7", token);

    await service.unlink("tg_test_7");

    const linked = await service.getLinkedAccount("tg_test_7");
    expect(linked).toBeNull();
  });
});
