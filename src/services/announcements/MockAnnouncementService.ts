import type { AnnouncementService } from "../proggaa/interfaces";
import { NotFoundError } from "../proggaa/errors";
import { logger } from "../../utils/logger";
import { mockCourses } from "../proggaa/mock/mockData";

/**
 * Mock course-announcement sender. A real implementation would fan this
 * out to every enrolled student's notification preferences via
 * `ProggaaNotificationService`; here it just simulates a recipient count
 * and logs the action, since "announcement sending" is explicitly called
 * out as a sensitive action in the spec's security section.
 */
export class MockAnnouncementService implements AnnouncementService {
  async sendAnnouncement(
    courseId: string,
    teacherProggaaUserId: string,
    message: string
  ): Promise<{ recipientCount: number }> {
    const course = mockCourses.find((c) => c.id === courseId);
    if (!course) throw new NotFoundError("Course");

    // Mock recipient count — a real implementation would count actual enrollments.
    const recipientCount = 40 + Math.floor(Math.random() * 40);

    logger.audit("announcement.sent", {
      courseId,
      teacherProggaaUserId,
      recipientCount,
      messageLength: message.length,
    });

    return { recipientCount };
  }
}
