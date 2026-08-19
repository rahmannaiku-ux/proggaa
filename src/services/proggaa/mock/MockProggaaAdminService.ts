import type { AdminStatistics, ProggaaRole, ProggaaUser, SystemAlert } from "../../../types/domain";
import type { ProggaaAdminService } from "../interfaces";
import { logger } from "../../../utils/logger";
import { mockAdminStats, mockUsers, mockPayments, mockLiveExams } from "./mockData";

export class MockProggaaAdminService implements ProggaaAdminService {
  async getStatistics(): Promise<AdminStatistics> {
    return mockAdminStats;
  }

  async listUsers(role?: ProggaaRole): Promise<ProggaaUser[]> {
    return role ? mockUsers.filter((u) => u.role === role) : mockUsers;
  }

  async disqualifyStudent(
    examId: string,
    studentId: string,
    adminProggaaUserId: string,
    reason: string
  ): Promise<void> {
    logger.audit("student.disqualified", { examId, studentId, adminProggaaUserId, reason });
  }

  async getAlerts(): Promise<SystemAlert[]> {
    const alerts: SystemAlert[] = [];

    const pendingPayments = mockPayments.filter((p) => p.status === "PENDING");
    if (pendingPayments.length > 0) {
      alerts.push({
        severity: "info",
        message: `${pendingPayments.length} payment${pendingPayments.length === 1 ? "" : "s"} awaiting review.`,
      });
    }

    for (const live of mockLiveExams) {
      if (live.suspiciousEvents > 0) {
        alerts.push({
          severity: live.suspiciousEvents >= 3 ? "critical" : "warning",
          message: `${live.examTitle}: ${live.suspiciousEvents} suspicious event${live.suspiciousEvents === 1 ? "" : "s"} flagged during the live exam.`,
        });
      }
    }

    alerts.push({ severity: "info", message: "All systems operational." });

    return alerts;
  }
}
