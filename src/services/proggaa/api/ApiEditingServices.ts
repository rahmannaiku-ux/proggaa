import type {
  ProggaaAdminManageService,
  ProggaaBuilderService,
  ProggaaProfileService,
} from "../interfaces";
import type {
  AdminChange,
  BuilderChange,
  BuilderImageTarget,
  BuilderMission,
  CoMentorRequest,
  ManagedMission,
  ManagedStoreItem,
  ManagedUser,
  MissionDiscount,
  MissionLevel,
  MissionStatus,
  NewMissionInput,
  PublicProfile,
} from "../../../types/editing";
import { ApiClient } from "./ApiClient";

/*
 * Editing the website from Telegram: thin clients of /api/bot/mentor/builder,
 * /api/bot/mentor/images, /api/bot/admin/manage and /api/bot/profile. The website
 * stores money in poisha; the bot speaks taka, so amounts are converted here only.
 */

const toPoisha = (taka: number) => Math.round(taka * 100);

interface WebDiscount {
  type: "PERCENTAGE" | "FIXED";
  percentOff: number | null;
  amountOffCents: number | null;
  isActive: boolean;
}

export function mapDiscount(d: WebDiscount | null | undefined): MissionDiscount | null {
  if (!d) return null;
  return {
    percentOff: d.type === "PERCENTAGE" ? d.percentOff : null,
    amountOffTaka: d.type === "FIXED" && d.amountOffCents !== null ? d.amountOffCents / 100 : null,
    isActive: d.isActive,
  };
}

export interface WebBuilderMission {
  id: string;
  title: string;
  subtitle: string | null;
  description: string;
  level: MissionLevel;
  status: MissionStatus;
  isFree: boolean;
  priceCents: number;
  examsEnabled: boolean;
  hasThumbnail: boolean;
  hasRoutineImage: boolean;
  category: { name: string } | null;
  enrollmentCount: number;
  discount: WebDiscount | null;
  operations: BuilderMission["operations"];
}

export function mapBuilderMission(m: WebBuilderMission): BuilderMission {
  return {
    id: m.id,
    title: m.title,
    subtitle: m.subtitle,
    description: m.description,
    level: m.level,
    status: m.status,
    isFree: m.isFree,
    priceTaka: m.priceCents / 100,
    examsEnabled: m.examsEnabled,
    hasThumbnail: m.hasThumbnail,
    hasRoutineImage: m.hasRoutineImage,
    categoryName: m.category?.name ?? null,
    enrollmentCount: m.enrollmentCount,
    discount: mapDiscount(m.discount),
    operations: (m.operations ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      chapters: (o.chapters ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        classTypes: (c.classTypes ?? []).map((g) => ({
          id: g.id,
          title: g.title,
          patrols: (g.patrols ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description ?? null,
            youtubeVideoId: p.youtubeVideoId,
            isPreview: Boolean(p.isPreview),
            hasThumbnail: Boolean(p.hasThumbnail),
            scheduledStart: p.scheduledStart ?? null,
          })),
        })),
      })),
    })),
  };
}

/** The website's field names for one change (poisha, not taka). */
export function builderChangeBody(change: BuilderChange): Record<string, unknown> {
  if (change.op === "mission.update") {
    const { priceTaka, ...rest } = change;
    return { ...rest, ...(priceTaka !== undefined ? { priceCents: toPoisha(priceTaka) } : {}) };
  }
  return { ...change };
}

export class ApiProggaaBuilderService implements ProggaaBuilderService {
  constructor(private readonly api: ApiClient) {}

  async getMission(mentorProggaaUserId: string, missionId: string): Promise<BuilderMission | null> {
    const m = await this.api.get<WebBuilderMission>("/api/bot/mentor/builder", { mentorId: mentorProggaaUserId, missionId });
    return m ? mapBuilderMission(m) : null;
  }

  async createMission(mentorProggaaUserId: string, input: NewMissionInput): Promise<{ id: string }> {
    const r = await this.api.post<{ id: string }>("/api/bot/mentor/builder", {
      mentorId: mentorProggaaUserId,
      op: "mission.create",
      title: input.title,
      description: input.description,
      isFree: input.priceTaka === 0,
      priceCents: toPoisha(input.priceTaka),
      level: "ALL_LEVELS",
    });
    return { id: r.id };
  }

  async apply(mentorProggaaUserId: string, missionId: string, change: BuilderChange) {
    const r = await this.api.post<{ id?: string; added?: number }>("/api/bot/mentor/builder", {
      mentorId: mentorProggaaUserId,
      missionId,
      ...builderChangeBody(change),
    });
    return { id: r?.id, added: r?.added };
  }

  async uploadImage(
    mentorProggaaUserId: string,
    missionId: string,
    target: BuilderImageTarget,
    image: { bytes: Uint8Array; filename: string; mimeType: string },
    patrolId?: string
  ): Promise<void> {
    const form = new FormData();
    form.set("mentorId", mentorProggaaUserId);
    form.set("missionId", missionId);
    form.set("target", target);
    if (patrolId) form.set("patrolId", patrolId);
    form.set("file", new Blob([image.bytes], { type: image.mimeType }), image.filename);
    await this.api.postForm("/api/bot/mentor/images", form);
  }
}

interface WebManagedMission {
  id: string;
  title: string;
  status: MissionStatus;
  isFree: boolean;
  priceCents: number;
  mentorName: string;
  enrollmentCount: number;
  discount: WebDiscount | null;
}

/** The website's field names for one admin change (poisha, not taka). */
export function adminChangeBody(change: AdminChange): Record<string, unknown> {
  if (change.op === "discount.set") {
    const { amountOffTaka, ...rest } = change;
    return { ...rest, ...(amountOffTaka !== undefined ? { amountOffCents: toPoisha(amountOffTaka) } : {}) };
  }
  return { ...change };
}

export class ApiProggaaAdminManageService implements ProggaaAdminManageService {
  constructor(private readonly api: ApiClient) {}

  async findUser(adminProggaaUserId: string, identifier: string): Promise<ManagedUser | null> {
    return this.api.get<ManagedUser>("/api/bot/admin/manage", { adminId: adminProggaaUserId, view: "user", identifier });
  }

  async listCoMentorRequests(adminProggaaUserId: string): Promise<CoMentorRequest[]> {
    return (await this.api.get<CoMentorRequest[]>("/api/bot/admin/manage", { adminId: adminProggaaUserId, view: "requests" })) ?? [];
  }

  async listMissions(adminProggaaUserId: string): Promise<ManagedMission[]> {
    const rows = await this.api.get<WebManagedMission[]>("/api/bot/admin/manage", { adminId: adminProggaaUserId, view: "missions" });
    return (rows ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      isFree: m.isFree,
      priceTaka: m.priceCents / 100,
      mentorName: m.mentorName,
      enrollmentCount: m.enrollmentCount,
      discount: mapDiscount(m.discount),
    }));
  }

  async listStoreItems(adminProggaaUserId: string): Promise<ManagedStoreItem[]> {
    return (await this.api.get<ManagedStoreItem[]>("/api/bot/admin/manage", { adminId: adminProggaaUserId, view: "store" })) ?? [];
  }

  async apply(adminProggaaUserId: string, change: AdminChange) {
    const r = await this.api.post<{ user?: ManagedUser; message?: string }>("/api/bot/admin/manage", {
      adminId: adminProggaaUserId,
      ...adminChangeBody(change),
    });
    return { user: r?.user, message: r?.message };
  }
}

export class ApiProggaaProfileService implements ProggaaProfileService {
  constructor(private readonly api: ApiClient) {}

  async getProfile(proggaaUserId: string): Promise<PublicProfile> {
    const r = await this.api.get<PublicProfile>("/api/bot/profile", { userId: proggaaUserId });
    return { headline: r?.headline ?? null, bio: r?.bio ?? null };
  }

  async updateProfile(proggaaUserId: string, change: { headline?: string; bio?: string }): Promise<void> {
    await this.api.post("/api/bot/profile", { userId: proggaaUserId, ...change });
  }
}
