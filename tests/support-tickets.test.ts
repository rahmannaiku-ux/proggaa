import { describe, expect, it } from "vitest";
import { MockSupportService } from "../src/services/support/MockSupportService";

describe("MockSupportService", () => {
  it("creates a ticket with a sequential human-readable ticket number", async () => {
    const service = new MockSupportService();
    const ticket = await service.createTicket("user_student_1", "COURSE_ACCESS", "Can't open lesson 3");
    expect(ticket.ticketNumber).toMatch(/^PRG-\d{6}$/);
    expect(ticket.status).toBe("WAITING");
    expect(ticket.priority).toBe("NORMAL");
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0].author).toBe("STUDENT");
  });

  it("attaches HIGH priority and context when supplied (e.g. an exam emergency)", async () => {
    const service = new MockSupportService();
    const ticket = await service.createTicket("user_student_1", "EXAM_PROBLEM", "Lost connection mid-exam", {
      priority: "HIGH",
      context: { examId: "exam_1", examTitle: "Midterm" },
    });
    expect(ticket.priority).toBe("HIGH");
    expect(ticket.context?.examId).toBe("exam_1");
  });

  it("moves WAITING -> IN_PROGRESS when staff reply, and reopens a CLOSED ticket on a student reply", async () => {
    const service = new MockSupportService();
    const ticket = await service.createTicket("user_student_1", "OTHER", "Question");
    expect(ticket.status).toBe("WAITING");

    await service.addMessage(ticket.id, "STAFF", "Teacher A", "Looking into it");
    let current = await service.getTicket(ticket.id);
    expect(current?.status).toBe("IN_PROGRESS");

    await service.setStatus(ticket.id, "CLOSED");
    await service.addMessage(ticket.id, "STUDENT", "You", "Still happening");
    current = await service.getTicket(ticket.id);
    expect(current?.status).toBe("WAITING");
  });

  it("scopes getTicketsForUser to that user only", async () => {
    const service = new MockSupportService();
    await service.createTicket("user_student_1", "OTHER", "A");
    await service.createTicket("user_student_2", "OTHER", "B");
    const mine = await service.getTicketsForUser("user_student_1");
    expect(mine.every((t) => t.userId === "user_student_1")).toBe(true);
  });

  it("assignTicket sets assignee and moves WAITING to IN_PROGRESS", async () => {
    const service = new MockSupportService();
    const ticket = await service.createTicket("user_student_1", "BUG_REPORT", "Button broken");
    const updated = await service.assignTicket(ticket.id, "user_teacher_1", "Teacher A");
    expect(updated.assignedToUserId).toBe("user_teacher_1");
    expect(updated.status).toBe("IN_PROGRESS");
  });

  it("listTickets filters by status, priority, and category", async () => {
    const service = new MockSupportService();
    await service.createTicket("user_student_1", "PAYMENT_PROBLEM", "TXID missing", { priority: "HIGH" });
    await service.createTicket("user_student_1", "OTHER", "Generic question");

    const highPriority = await service.listTickets({ priority: "HIGH" });
    expect(highPriority.every((t) => t.priority === "HIGH")).toBe(true);

    const paymentOnly = await service.listTickets({ category: "PAYMENT_PROBLEM" });
    expect(paymentOnly.every((t) => t.category === "PAYMENT_PROBLEM")).toBe(true);
  });
});
