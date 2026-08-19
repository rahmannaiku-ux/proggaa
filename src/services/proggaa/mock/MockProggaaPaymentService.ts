import type { Payment } from "../../../types/domain";
import type { ProggaaPaymentService } from "../interfaces";
import { NotFoundError, ValidationError } from "../errors";
import { logger } from "../../../utils/logger";
import { mockPayments } from "./mockData";

export class MockProggaaPaymentService implements ProggaaPaymentService {
  async getPendingPayments(): Promise<Payment[]> {
    return mockPayments.filter((p) => p.status === "PENDING");
  }

  async getPaymentById(paymentId: string): Promise<Payment | null> {
    return mockPayments.find((p) => p.id === paymentId) ?? null;
  }

  async getPaymentsForStudent(proggaaUserId: string): Promise<Payment[]> {
    return mockPayments
      .filter((p) => p.studentId === proggaaUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async submitTransactionId(paymentId: string, proggaaUserId: string, transactionId: string): Promise<Payment> {
    const payment = mockPayments.find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundError("Payment");
    if (payment.studentId !== proggaaUserId) throw new NotFoundError("Payment");
    if (payment.status !== "PENDING") {
      throw new ValidationError("This payment has already been processed.");
    }
    payment.transactionId = transactionId;
    logger.audit("payment.txid_submitted", { paymentId, proggaaUserId });
    return payment;
  }

  async approvePayment(paymentId: string, approvedByProggaaUserId: string): Promise<Payment> {
    const payment = mockPayments.find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundError("Payment");
    if (payment.status !== "PENDING") {
      throw new ValidationError("This payment has already been processed.");
    }
    payment.status = "APPROVED";
    logger.audit("payment.approved", { paymentId, approvedByProggaaUserId });
    return payment;
  }

  async rejectPayment(
    paymentId: string,
    rejectedByProggaaUserId: string,
    reason?: string
  ): Promise<Payment> {
    const payment = mockPayments.find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundError("Payment");
    if (payment.status !== "PENDING") {
      throw new ValidationError("This payment has already been processed.");
    }
    payment.status = "REJECTED";
    logger.audit("payment.rejected", { paymentId, rejectedByProggaaUserId, reason: reason ?? "" });
    return payment;
  }
}
