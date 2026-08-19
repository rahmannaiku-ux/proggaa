import type {
  SupportCategory,
  SupportTicket,
  SupportTicketContext,
  SupportTicketMessage,
  SupportTicketPriority,
  SupportTicketStatus,
} from "../../types/domain";
import type { SupportService } from "../proggaa/interfaces";
import { FileStore } from "../../utils/persistence";
import { logger } from "../../utils/logger";

interface SupportStoreShape {
  tickets: SupportTicket[];
  idCounter: number;
  messageIdCounter: number;
}

const store = new FileStore<SupportStoreShape>("support-tickets.json", {
  tickets: [],
  idCounter: 0,
  messageIdCounter: 0,
});

function ticketNumber(n: number): string {
  return `PRG-${String(n).padStart(6, "0")}`;
}

/**
 * Local ticket storage — JSON-file-persisted when PERSISTENCE_DIR is set,
 * in-memory otherwise (see utils/persistence.ts). Later this becomes an
 * ApiSupportService that writes into the real Proggaa support/helpdesk
 * system; nothing outside this file needs to change when that happens.
 */
export class MockSupportService implements SupportService {
  async createTicket(
    proggaaUserId: string,
    category: SupportCategory,
    message: string,
    options?: { priority?: SupportTicketPriority; context?: SupportTicketContext }
  ): Promise<SupportTicket> {
    store.data.idCounter += 1;
    store.data.messageIdCounter += 1;
    const now = new Date().toISOString();
    const openingMessage: SupportTicketMessage = {
      id: `msg_${store.data.messageIdCounter}`,
      author: "STUDENT",
      authorName: "Student",
      body: message,
      createdAt: now,
    };
    const ticket: SupportTicket = {
      id: `ticket_${store.data.idCounter}`,
      ticketNumber: ticketNumber(store.data.idCounter),
      userId: proggaaUserId,
      category,
      priority: options?.priority ?? "NORMAL",
      status: "WAITING",
      context: options?.context,
      messages: [openingMessage],
      createdAt: now,
      updatedAt: now,
    };
    store.data.tickets.push(ticket);
    store.save();
    logger.info("support.ticket_created", {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      category,
      priority: ticket.priority,
      proggaaUserId,
    });
    return ticket;
  }

  async getTicketsForUser(proggaaUserId: string): Promise<SupportTicket[]> {
    return store.data.tickets
      .filter((t) => t.userId === proggaaUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getTicket(ticketId: string): Promise<SupportTicket | null> {
    return store.data.tickets.find((t) => t.id === ticketId) ?? null;
  }

  async addMessage(
    ticketId: string,
    author: "STUDENT" | "STAFF",
    authorName: string,
    body: string
  ): Promise<SupportTicket> {
    const ticket = store.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new Error(`SupportTicket not found: ${ticketId}`);
    }
    store.data.messageIdCounter += 1;
    const now = new Date().toISOString();
    ticket.messages.push({
      id: `msg_${store.data.messageIdCounter}`,
      author,
      authorName,
      body,
      createdAt: now,
    });
    ticket.updatedAt = now;
    // A student following up on a resolved/closed ticket reopens it rather
    // than silently going nowhere. Staff replies move a fresh ticket along.
    if (author === "STUDENT" && (ticket.status === "RESOLVED" || ticket.status === "CLOSED")) {
      ticket.status = "WAITING";
    } else if (author === "STAFF" && ticket.status === "WAITING") {
      ticket.status = "IN_PROGRESS";
    }
    store.save();
    logger.info("support.ticket_message_added", { ticketId, author, status: ticket.status });
    return ticket;
  }

  async setStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket> {
    const ticket = store.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new Error(`SupportTicket not found: ${ticketId}`);
    }
    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    store.save();
    logger.info("support.ticket_status_changed", { ticketId, status });
    return ticket;
  }

  async assignTicket(ticketId: string, staffUserId: string, staffName: string): Promise<SupportTicket> {
    const ticket = store.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new Error(`SupportTicket not found: ${ticketId}`);
    }
    ticket.assignedToUserId = staffUserId;
    ticket.assignedToName = staffName;
    if (ticket.status === "WAITING") ticket.status = "IN_PROGRESS";
    ticket.updatedAt = new Date().toISOString();
    store.save();
    logger.info("support.ticket_assigned", { ticketId, staffUserId });
    return ticket;
  }

  async listTickets(filter?: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    category?: SupportCategory;
    assignedToUserId?: string;
  }): Promise<SupportTicket[]> {
    return store.data.tickets
      .filter((t) => !filter?.status || t.status === filter.status)
      .filter((t) => !filter?.priority || t.priority === filter.priority)
      .filter((t) => !filter?.category || t.category === filter.category)
      .filter((t) => !filter?.assignedToUserId || t.assignedToUserId === filter.assignedToUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
