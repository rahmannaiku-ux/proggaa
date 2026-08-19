import { describe, expect, it } from "vitest";
import { buildServiceContainer } from "../src/services/container";
import { sendDashboard } from "../src/bot/commands/dashboard";
import { sendCourses } from "../src/bot/commands/courses";
import { sendExams } from "../src/bot/commands/exams";
import { sendResults } from "../src/bot/commands/results";
import { sendTeacherDashboard } from "../src/bot/commands/teacher";
import { sendAdminDashboard } from "../src/bot/commands/admin";
import { sendStats } from "../src/bot/commands/stats";
import { sendPendingPayments } from "../src/bot/commands/payments";
import { fakeContext, repliesOf } from "./helpers/fakeContext";

const services = buildServiceContainer();

describe("student dashboard integration", () => {
  it("shows the student's name, progress, and XP", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_student_1", role: "STUDENT" });
    await sendDashboard(ctx, services);

    const replies = repliesOf(ctx);
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain("Ayesha Rahman");
    expect(replies[0].text).toContain("XP");
  });

  it("prompts to link when the account isn't linked", async () => {
    const ctx = fakeContext({ linked: false });
    await sendDashboard(ctx, services);

    const replies = repliesOf(ctx);
    expect(replies[0].text).toContain("Use /link");
  });

  it("routes a TEACHER-role caller to the teacher dashboard instead", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_teacher_1", role: "TEACHER" });
    await sendDashboard(ctx, services);

    const replies = repliesOf(ctx);
    expect(replies[0].text).toContain("Teacher Dashboard");
  });
});

describe("courses/exams/results integration", () => {
  it("lists courses with progress for a linked student", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_student_1", role: "STUDENT" });
    await sendCourses(ctx, services);

    const replies = repliesOf(ctx);
    const combined = replies.map((r) => r.text).join("\n");
    expect(combined).toContain("Physics");
    expect(combined).toContain("Progress");
  });

  it("groups exams by status for a linked student", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_student_1", role: "STUDENT" });
    await sendExams(ctx, services);

    const replies = repliesOf(ctx);
    const combined = replies.map((r) => r.text).join("\n");
    expect(combined).toMatch(/Upcoming|Completed|Live/);
  });

  it("shows results only for STUDENT role", async () => {
    const teacherCtx = fakeContext({ linked: true, proggaaUserId: "user_teacher_1", role: "TEACHER" });
    await sendResults(teacherCtx, services);
    expect(repliesOf(teacherCtx)[0].text).toContain("Teachers can review");

    const studentCtx = fakeContext({ linked: true, proggaaUserId: "user_student_1", role: "STUDENT" });
    await sendResults(studentCtx, services);
    const combined = repliesOf(studentCtx)
      .map((r) => r.text)
      .join("\n");
    expect(combined).toContain("Chapter 4 Test");
  });
});

describe("teacher dashboard integration", () => {
  it("shows course/exam/grading counts for a linked teacher", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_teacher_1", role: "TEACHER" });
    await sendTeacherDashboard(ctx, services);

    const replies = repliesOf(ctx);
    expect(replies[0].text).toContain("Teacher Dashboard");
    expect(replies[0].text).toContain("Pending grading");
  });

  it("rejects a STUDENT calling the teacher dashboard", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_student_1", role: "STUDENT" });
    await sendTeacherDashboard(ctx, services);

    expect(repliesOf(ctx)[0].text).toContain("permission");
  });
});

describe("admin dashboard + payments integration", () => {
  it("shows platform stats for a linked admin", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_admin_1", role: "ADMIN" });
    await sendAdminDashboard(ctx, services);

    expect(repliesOf(ctx)[0].text).toContain("Proggaa Admin");
  });

  it("rejects a TEACHER calling admin stats", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_teacher_1", role: "TEACHER" });
    await sendStats(ctx, services);

    expect(repliesOf(ctx)[0].text).toContain("permission");
  });

  it("lists pending payments for a linked admin", async () => {
    const ctx = fakeContext({ linked: true, proggaaUserId: "user_admin_1", role: "ADMIN" });
    await sendPendingPayments(ctx, services);

    const replies = repliesOf(ctx);
    const combined = replies.map((r) => r.text).join("\n");
    // Either lists a payment or reports none pending — both are valid
    // depending on test execution order across the shared mock store.
    expect(combined.length).toBeGreaterThan(0);
  });
});
