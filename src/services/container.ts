import { env } from "../config/env";
import type {
  NotificationPreferenceService,
  ProggaaAchievementService,
  ProggaaAdminManageService,
  ProggaaAdminService,
  ProggaaBuilderService,
  ProggaaCatalogService,
  ProggaaCommunityService,
  ProggaaCourseService,
  ProggaaExamService,
  ProggaaLearningService,
  ProggaaLiveClassService,
  ProggaaMentorToolsService,
  ProggaaNotificationFeed,
  ProggaaNotificationService,
  ProggaaPaymentService,
  ProggaaProfileService,
  ProggaaResultService,
  ProggaaStoreService,
  ProggaaUserService,
  TelegramLinkService,
} from "./proggaa/interfaces";
import { DeepLinkService } from "./deep-links/DeepLinkService";
import { InMemoryGroupService, type GroupService } from "./groups/GroupService";
import { FilePreferenceService } from "./notifications/PreferenceService";
import { ApiClient } from "./proggaa/api/ApiClient";
import {
  ApiProggaaAchievementService,
  ApiProggaaAdminService,
  ApiProggaaCatalogService,
  ApiProggaaCommunityService,
  ApiProggaaCourseService,
  ApiProggaaExamService,
  ApiProggaaLearningService,
  ApiProggaaLiveClassService,
  ApiProggaaMentorToolsService,
  ApiProggaaNotificationFeed,
  ApiProggaaNotificationService,
  ApiProggaaPaymentService,
  ApiProggaaResultService,
  ApiProggaaStoreService,
  ApiProggaaUserService,
} from "./proggaa/api/ApiServices";
import { ApiTelegramLinkService } from "./proggaa/api/ApiTelegramLinkService";
import {
  ApiProggaaAdminManageService,
  ApiProggaaBuilderService,
  ApiProggaaProfileService,
} from "./proggaa/api/ApiEditingServices";

/**
 * Everything the bot needs, resolved once at startup.
 *
 * Bot code depends on these interfaces only. In production they are all the
 * Api* classes that call the Proggaa website; the tests build the same shape
 * from in-memory fakes (tests/fakes). The only things the bot owns itself are
 * the notification mutes, the group assistant's settings and the relay's
 * position in the feed; everything else is read from Proggaa on demand.
 */
export interface ServiceContainer {
  userService: ProggaaUserService;
  courseService: ProggaaCourseService;
  examService: ProggaaExamService;
  resultService: ProggaaResultService;
  paymentService: ProggaaPaymentService;
  liveClassService: ProggaaLiveClassService;
  learningService: ProggaaLearningService;
  catalogService: ProggaaCatalogService;
  storeService: ProggaaStoreService;
  communityService: ProggaaCommunityService;
  mentorToolsService: ProggaaMentorToolsService;
  notificationService: ProggaaNotificationService;
  notificationFeed: ProggaaNotificationFeed;
  preferenceService: NotificationPreferenceService;
  achievementService: ProggaaAchievementService;
  adminService: ProggaaAdminService;
  builderService: ProggaaBuilderService;
  adminManageService: ProggaaAdminManageService;
  profileService: ProggaaProfileService;
  linkService: TelegramLinkService;
  deepLinkService: DeepLinkService;
  groupService: GroupService;
}

export function buildApiServices(api: ApiClient) {
  return {
    userService: new ApiProggaaUserService(api),
    courseService: new ApiProggaaCourseService(api),
    examService: new ApiProggaaExamService(api),
    resultService: new ApiProggaaResultService(api),
    paymentService: new ApiProggaaPaymentService(api),
    liveClassService: new ApiProggaaLiveClassService(api),
    learningService: new ApiProggaaLearningService(api),
    catalogService: new ApiProggaaCatalogService(api),
    storeService: new ApiProggaaStoreService(api),
    communityService: new ApiProggaaCommunityService(api),
    mentorToolsService: new ApiProggaaMentorToolsService(api),
    notificationService: new ApiProggaaNotificationService(api),
    notificationFeed: new ApiProggaaNotificationFeed(api),
    achievementService: new ApiProggaaAchievementService(api),
    adminService: new ApiProggaaAdminService(api),
    builderService: new ApiProggaaBuilderService(api),
    adminManageService: new ApiProggaaAdminManageService(api),
    profileService: new ApiProggaaProfileService(api),
    linkService: new ApiTelegramLinkService(api),
  };
}

/** Fails fast, with a plain message, when the bot cannot reach Proggaa. */
export function assertProggaaConfig(config: { apiUrl: string; apiKey?: string; nodeEnv: string }): void {
  if (!config.apiKey || config.apiKey.length < 16) {
    throw new Error("PROGGAA_API_KEY is missing or too short. Use the same value as PROGGAA_API_KEY on the Proggaa website.");
  }
  const host = new URL(config.apiUrl).hostname;
  if (config.nodeEnv === "production" && (host === "localhost" || host === "127.0.0.1")) {
    throw new Error("PROGGAA_WEB_URL / PROGGAA_API_URL point at localhost in production. Set the website's public address.");
  }
}

export function buildServiceContainer(): ServiceContainer {
  const apiUrl = env.PROGGAA_API_URL ?? env.PROGGAA_WEB_URL;
  assertProggaaConfig({ apiUrl, apiKey: env.PROGGAA_API_KEY, nodeEnv: env.NODE_ENV });

  return {
    ...buildApiServices(new ApiClient(apiUrl, env.PROGGAA_API_KEY!)),
    preferenceService: new FilePreferenceService(),
    deepLinkService: new DeepLinkService(),
    groupService: new InMemoryGroupService(),
  };
}
