import { describe, expect, it } from "vitest";
import { MockProggaaAIService } from "../src/services/proggaa/mock/MockProggaaAIService";
import { MockQuestionBankService } from "../src/services/proggaa/mock/MockQuestionBankService";
import { MockProggaaAchievementService } from "../src/services/proggaa/mock/MockProggaaAchievementService";
import { MockProggaaAdminService } from "../src/services/proggaa/mock/MockProggaaAdminService";
import { NotFoundError } from "../src/services/proggaa/errors";

describe("MockProggaaAIService", () => {
  const service = new MockProggaaAIService();

  it("generates the requested number of MCQ questions", async () => {
    const result = await service.generateMCQ({ topic: "Electricity", difficulty: "EASY", count: 5 });
    expect(result.questions).toHaveLength(5);
    expect(result.questions.every((q) => q.type === "MCQ")).toBe(true);
    expect(result.questions.every((q) => q.choices && q.choices.length > 0)).toBe(true);
  });

  it("caps generation count at 20", async () => {
    const result = await service.generateNumerical({ topic: "Kinematics", difficulty: "HARD", count: 999 });
    expect(result.questions).toHaveLength(20);
  });

  it("generates a mixed set of question types for generateMixedExam", async () => {
    const result = await service.generateMixedExam({ topic: "Chemistry", difficulty: "MEDIUM", count: 6 });
    const types = new Set(result.questions.map((q) => q.type));
    expect(types.size).toBeGreaterThan(1);
  });

  it("derives a topic from source text for generateFromText", async () => {
    const result = await service.generateFromText("Newton's laws of motion describe...", "SHORT_ANSWER", 2);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].type).toBe("SHORT_ANSWER");
  });
});

describe("MockQuestionBankService", () => {
  it("creates and retrieves a question", async () => {
    const service = new MockQuestionBankService();
    const created = await service.createQuestion({
      type: "MCQ",
      difficulty: "EASY",
      topic: "Test Topic",
      prompt: "What is 2+2?",
      choices: ["3", "4", "5"],
      correctAnswer: "4",
    });
    const fetched = await service.getQuestion(created.id);
    expect(fetched?.prompt).toBe("What is 2+2?");
  });

  it("searches by topic (case-insensitive substring)", async () => {
    const service = new MockQuestionBankService();
    const results = await service.searchQuestions({ topic: "electric" });
    expect(results.every((q) => q.topic.toLowerCase().includes("electric"))).toBe(true);
  });

  it("throws NotFoundError when deleting an unknown question", async () => {
    const service = new MockQuestionBankService();
    await expect(service.deleteQuestion("does_not_exist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes a question", async () => {
    const service = new MockQuestionBankService();
    const created = await service.createQuestion({
      type: "SHORT_ANSWER",
      difficulty: "MEDIUM",
      topic: "Temp",
      prompt: "Temp question",
    });
    await service.deleteQuestion(created.id);
    const fetched = await service.getQuestion(created.id);
    expect(fetched).toBeNull();
  });
});

describe("MockProggaaAchievementService", () => {
  it("returns achievements for a known student", async () => {
    const service = new MockProggaaAchievementService();
    const achievements = await service.getAchievementsForUser("user_student_1");
    expect(achievements.length).toBeGreaterThan(0);
  });

  it("returns an empty array for a user with no achievements", async () => {
    const service = new MockProggaaAchievementService();
    const achievements = await service.getAchievementsForUser("user_admin_1");
    expect(achievements).toEqual([]);
  });
});

describe("MockProggaaAdminService", () => {
  it("returns platform statistics", async () => {
    const service = new MockProggaaAdminService();
    const stats = await service.getStatistics();
    expect(stats.studentCount).toBeGreaterThan(0);
  });

  it("filters users by role", async () => {
    const service = new MockProggaaAdminService();
    const teachers = await service.listUsers("TEACHER");
    expect(teachers.every((u) => u.role === "TEACHER")).toBe(true);
  });
});
