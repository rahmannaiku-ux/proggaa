import type { Achievement } from "../../../types/domain";
import type { ProggaaAchievementService } from "../interfaces";
import { mockAchievements } from "./mockData";

export class MockProggaaAchievementService implements ProggaaAchievementService {
  async getAchievementsForUser(proggaaUserId: string): Promise<Achievement[]> {
    return mockAchievements.filter((a) => a.userId === proggaaUserId);
  }
}
