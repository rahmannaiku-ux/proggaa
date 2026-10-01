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
import { ApiClient } from "./proggaa/api/ApiClient";
import {
  ApiProggaaAchievementService,
  ApiProggaaAdminService,
  ApiProggaaCourseService,
  ApiProggaaExamService,
  ApiProggaaNotificationService,
  ApiProggaaPaymentService,
  ApiProggaaResultService,
  ApiProggaaUserService,
} from "./proggaa/api/ApiServices";
import { ApiTelegramLinkService } from "./proggaa/api/ApiTelegramLinkService";

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

type Provider = "mock" | "api";

function unsupportedProvider(serviceName: string): never {
  throw new Error(`${serviceName}: provider "api" is not implemented for this service.`);
}

export function buildServiceContainer(): ServiceContainer {
  // Each service follows PROGGAA_PROVIDER unless its own switch says otherwise.
  const pick = (own?: Provider): Provider => own ?? env.PROGGAA_PROVIDER;
  const providers = {
    user: pick(env.PROGGAA_USER_PROVIDER),
    course: pick(env.PROGGAA_COURSE_PROVIDER),
    exam: pick(env.PROGGAA_EXAM_PROVIDER),
    result: pick(env.PROGGAA_RESULT_PROVIDER),
    payment: pick(env.PROGGAA_PAYMENT_PROVIDER),
    notification: pick(env.PROGGAA_NOTIFICATION_PROVIDER),
    admin: pick(env.PROGGAA_ADMIN_PROVIDER),
    achievement: pick(env.PROGGAA_ACHIEVEMENT_PROVIDER),
    link: pick(env.PROGGAA_LINK_PROVIDER),
  };

  // Only built when some service really uses it, so the demo setup needs no API settings.
  let apiClient: ApiClient | null = null;
  const api = (): ApiClient => {
    apiClient ??= new ApiClient(env.PROGGAA_API_URL ?? env.PROGGAA_WEB_URL, env.PROGGAA_API_KEY ?? "");
    return apiClient;
  };

  const userService: ProggaaUserService =
    providers.user === "api" ? new ApiProggaaUserService(api()) : new MockProggaaUserService();

  const courseService: ProggaaCourseService =
    providers.course === "api" ? new ApiProggaaCourseService(api()) : new MockProggaaCourseService();

  const examService: ProggaaExamService =
    providers.exam === "api" ? new ApiProggaaExamService(api()) : new MockProggaaExamService();

  const resultService: ProggaaResultService =
    providers.result === "api" ? new ApiProggaaResultService(api()) : new MockProggaaResultService();

  const paymentService: ProggaaPaymentService =
    providers.payment === "api" ? new ApiProggaaPaymentService(api()) : new MockProggaaPaymentService();

  const baseNotificationService: ProggaaNotificationService =
    providers.notification === "api"
      ? new ApiProggaaNotificationService(api())
      : new MockProggaaNotificationService();

  const notificationPreferenceService: NotificationPreferenceService =
    new MockNotificationPreferenceService();

  const aiService: ProggaaAIService =
    env.PROGGAA_AI_PROVIDER === "api" ? unsupportedProvider("ProggaaAIService") : new MockProggaaAIService();

  const adminService: ProggaaAdminService =
    providers.admin === "api" ? new ApiProggaaAdminService(api()) : new MockProggaaAdminService();

  const questionBankService: QuestionBankService = new MockQuestionBankService();

  const supportService: SupportService = new MockSupportService();

  const achievementService: ProggaaAchievementService =
    providers.achievement === "api" ? new ApiProggaaAchievementService(api()) : new MockProggaaAchievementService();

  const announcementService: AnnouncementService = new MockAnnouncementService();

  const linkService: TelegramLinkService =
    providers.link === "api" ? new ApiTelegramLinkService(api()) : new MockTelegramLinkService();

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
