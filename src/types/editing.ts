/**
 * What the bot shows and changes when Mentors and admins edit the website from
 * Telegram. Shapes are the bot's own (taka, plain words), mapped from the website's
 * /api/bot/mentor/builder, /api/bot/admin/manage and /api/bot/profile answers.
 */

export type MissionLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS";
export type MissionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface BuilderPatrol {
  id: string;
  title: string;
  description: string | null;
  youtubeVideoId: string;
  isPreview: boolean;
  hasThumbnail: boolean;
  /** ISO instant when this Patrol is a live class. */
  scheduledStart: string | null;
}

export interface BuilderClassType {
  id: string;
  title: string;
  patrols: BuilderPatrol[];
}

export interface BuilderChapter {
  id: string;
  title: string;
  classTypes: BuilderClassType[];
}

export interface BuilderOperation {
  id: string;
  title: string;
  chapters: BuilderChapter[];
}

export interface MissionDiscount {
  /** One of the two is set. */
  percentOff: number | null;
  amountOffTaka: number | null;
  isActive: boolean;
}

/** A whole Mission as its Mentor edits it, drafts included. */
export interface BuilderMission {
  id: string;
  title: string;
  subtitle: string | null;
  description: string;
  level: MissionLevel;
  status: MissionStatus;
  isFree: boolean;
  priceTaka: number;
  examsEnabled: boolean;
  hasThumbnail: boolean;
  hasRoutineImage: boolean;
  categoryName: string | null;
  enrollmentCount: number;
  discount: MissionDiscount | null;
  operations: BuilderOperation[];
}

/** One change to a Mission. Each maps to one operation of the website's builder. */
export type BuilderChange =
  | { op: "mission.update"; title?: string; subtitle?: string; description?: string; level?: MissionLevel; isFree?: boolean; priceTaka?: number; removeThumbnail?: boolean; removeRoutineImage?: boolean }
  | { op: "mission.publish"; publish: boolean }
  | { op: "mission.exams"; enabled: boolean }
  | { op: "operation.rename"; operationId: string; title: string }
  | { op: "operation.delete"; operationId: string }
  | { op: "chapter.rename"; chapterId: string; title: string }
  | { op: "chapter.delete"; chapterId: string }
  | { op: "classtype.rename"; classTypeId: string; title: string }
  | { op: "classtype.delete"; classTypeId: string }
  | { op: "patrol.create"; classTypeId: string; title: string; youtubeUrl: string; description?: string; isPreview?: boolean; scheduledStart?: string }
  | { op: "patrol.update"; patrolId: string; title?: string; description?: string; youtubeUrl?: string; isPreview?: boolean; removeThumbnail?: boolean }
  | { op: "patrol.delete"; patrolId: string }
  /** One item, or one per line. Patrols are "Title | YouTube link" per line. */
  | { op: "bulk.add"; kind: "modules" | "chapters" | "groups" | "lessons"; parentId: string; text: string };

export type BuilderImageTarget = "thumbnail" | "routine" | "patrol";

export interface NewMissionInput {
  title: string;
  description: string;
  priceTaka: number;
}

/** An account as an admin sees it. */
export interface ManagedUser {
  id: string;
  name: string;
  email: string | null;
  /** Masked, e.g. 017•••••789. */
  phone: string | null;
  /** The website's role, SUPER_ADMIN included, because admin tools must tell them apart. */
  role: "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";
  isSuspended: boolean;
  xp: number;
  coinBalance: number;
  streakDays: number;
  enrollmentCount: number;
  createdAt: string;
}

export interface CoMentorRequest {
  id: string;
  missionTitle: string;
  mentorName: string;
  requestedByName: string;
  roleLabel: string | null;
  createdAt: string;
}

export interface ManagedMission {
  id: string;
  title: string;
  status: MissionStatus;
  isFree: boolean;
  priceTaka: number;
  mentorName: string;
  enrollmentCount: number;
  discount: MissionDiscount | null;
}

export interface ManagedStoreItem {
  id: string;
  title: string;
  type: string;
  priceCoins: number;
  isPublished: boolean;
}

/** One admin change. Each maps to one admin-panel action on the website. */
export type AdminChange =
  | { op: "user.role"; userId: string; role: ManagedUser["role"] }
  | { op: "user.suspend"; userId: string; suspended: boolean }
  | { op: "coins.adjust"; userId: string; amount: number; reason: string }
  | { op: "announce.global"; title: string; body: string }
  | { op: "category.create"; name: string }
  | { op: "mission.status"; missionId: string; status: MissionStatus }
  | { op: "discount.set"; missionId: string; percentOff?: number; amountOffTaka?: number }
  | { op: "discount.toggle"; missionId: string; active: boolean }
  | { op: "discount.delete"; missionId: string }
  | { op: "store.toggle"; itemId: string; published: boolean }
  | { op: "request.approve"; requestId: string }
  | { op: "request.reject"; requestId: string; reason: string };

export interface PublicProfile {
  headline: string | null;
  bio: string | null;
}
