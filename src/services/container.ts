import { env } from "../config/env";
import { Telegram } from "telegraf";
import type {
  AnnouncementService,
  NotificationPreferenceService,
  ProggaaAchievementService,
  ProggaaAdminService,
  ProggaaAIService,
  ProggaaCourseService,
  ProggaaExamService,
  ProggaaNotificationService,
  ProggaaPaymentService,
  ProggaaResultService,
  ProggaaUserService,
  QuestionBankService,
  SupportService,
  TelegramLinkService,
} from "./proggaa/interfaces";
import { DeepLinkService } from "./deep-links/DeepLinkService";

import { MockProggaaUserService } from "./proggaa/mock/MockProggaaUserService";
import { MockProggaaAchievementService } from "./proggaa/mock/MockProggaaAchievementService";
import { MockProggaaCourseService } from "./proggaa/mock/MockProggaaCourseService";
import { MockProggaaExamService } from "./proggaa/mock/MockProggaaExamService";
import { MockProggaaResultService } from "./proggaa/mock/MockProggaaResultService";
import { MockProggaaPaymentService } from "./proggaa/mock/MockProggaaPaymentService";
import {
  MockNotificationPreferenceService,
  MockProggaaNotificationService,
} from "./proggaa/mock/MockProggaaNotificationService";
import { MockProggaaAIService } from "./proggaa/mock/MockProggaaAIService";
import { MockProggaaAdminService } from "./proggaa/mock/MockProggaaAdminService";
import { MockQuestionBankService } from "./proggaa/mock/MockQuestionBankService";
import { MockSupportService } from "./support/MockSupportService";
import { MockAnnouncementService } from "./announcements/MockAnnouncementService";
import { MockTelegramLinkService } from "./linking/mock/MockTelegramLinkService";
import { InMemoryGroupService, type GroupService } from "./groups/GroupService";
import { PushingNotificationService } from "./notifications/PushingNotificationService";

/**
 * Everything the bot needs, resolved once at startup.
 *
 * Each field is typed against the *interface*, never the mock class, so
 * bot code (commands/handlers) can never accidentally depend on
 * mock-only behavior. To go live with a real Proggaa API:
 *
 *   1. Implement e.g. `ApiProggaaExamService implements ProggaaExamService`.
 *   2. Add an `"api"` branch below that returns `new ApiProggaaExamService(...)`.
 *   3. Set PROGGAA_EXAM_PROVIDER=api in .env.
 *
 * No command, keyboard, or middleware file needs to change.
 */
export interface ServiceContainer {
  userService: ProggaaUserService;
  courseService: ProggaaCourseService;
  examService: ProggaaExamService;
  resultService: ProggaaResultService;
  paymentService: ProggaaPaymentService;
  notificationService: ProggaaNotificationService;
  notificationPreferenceService: NotificationPreferenceService;
  aiService: ProggaaAIService;
  adminService: ProggaaAdminService;
  questionBankService: QuestionBankService;
  supportService: SupportService;
  achievementService: ProggaaAchievementService;
  announcementService: AnnouncementService;
  linkService: TelegramLinkService;
  deepLinkService: DeepLinkService;
  groupService: GroupService;
}

function unsupportedProvider(serviceName: string): never {
  throw new Error(
    `${serviceName}: provider "api" is not implemented yet. ` +
      `Implement Api${serviceName} and wire it in services/container.ts.`
  );
}

export function buildServiceContainer(): ServiceContainer {
  const userService: ProggaaUserService =
    env.PROGGAA_USER_PROVIDER === "mock" ? new MockProggaaUserService() : unsupportedProvider("ProggaaUserService");

  const courseService: ProggaaCourseService =
    env.PROGGAA_COURSE_PROVIDER === "mock"
      ? new MockProggaaCourseService()
      : unsupportedProvider("ProggaaCourseService");

  const examService: ProggaaExamService =
    env.PROGGAA_EXAM_PROVIDER === "mock" ? new MockProggaaExamService() : unsupportedProvider("ProggaaExamService");

  const resultService: ProggaaResultService =
    env.PROGGAA_RESULT_PROVIDER === "mock"
      ? new MockProggaaResultService()
      : unsupportedProvider("ProggaaResultService");

  const paymentService: ProggaaPaymentService =
    env.PROGGAA_PAYMENT_PROVIDER === "mock"
      ? new MockProggaaPaymentService()
      : unsupportedProvider("ProggaaPaymentService");

  const baseNotificationService: ProggaaNotificationService =
    env.PROGGAA_NOTIFICATION_PROVIDER === "mock"
      ? new MockProggaaNotificationService()
      : unsupportedProvider("ProggaaNotificationService");

  const notificationPreferenceService: NotificationPreferenceService =
    new MockNotificationPreferenceService();

  const aiService: ProggaaAIService =
    env.PROGGAA_AI_PROVIDER === "mock" ? new MockProggaaAIService() : unsupportedProvider("ProggaaAIService");

  const adminService: ProggaaAdminService =
    env.PROGGAA_ADMIN_PROVIDER === "mock"
      ? new MockProggaaAdminService()
      : unsupportedProvider("ProggaaAdminService");

  const questionBankService: QuestionBankService = new MockQuestionBankService();

  const supportService: SupportService = new MockSupportService();

  const achievementService: ProggaaAchievementService = new MockProggaaAchievementService();

  const announcementService: AnnouncementService = new MockAnnouncementService();

  const linkService: TelegramLinkService =
    env.PROGGAA_LINK_PROVIDER === "mock"
      ? new MockTelegramLinkService()
      : unsupportedProvider("TelegramLinkService");

  const deepLinkService = new DeepLinkService();

  const groupService: GroupService = new InMemoryGroupService();

  // Wrapped last, once linkService + notificationPreferenceService exist:
  // dispatch() still stores every event for /notifications as before, and
  // now also pushes it to the student's Telegram chat immediately when
  // they're linked and haven't muted that category.
  const telegramClient = new Telegram(env.BOT_TOKEN);
  const notificationService: ProggaaNotificationService = new PushingNotificationService(
    baseNotificationService,
    telegramClient,
    linkService,
    notificationPreferenceService
  );

  return {
    userService,
    courseService,
    examService,
    resultService,
    paymentService,
    notificationService,
    notificationPreferenceService,
    aiService,
    adminService,
    questionBankService,
    supportService,
    achievementService,
    announcementService,
    linkService,
    deepLinkService,
    groupService,
  };
}
