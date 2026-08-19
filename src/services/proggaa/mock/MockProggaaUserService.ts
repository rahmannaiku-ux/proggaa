import type { ProggaaRole, ProggaaUser } from "../../../types/domain";
import type { ProggaaUserService } from "../interfaces";
import { mockUsers } from "./mockData";

export class MockProggaaUserService implements ProggaaUserService {
  async getUserById(proggaaUserId: string): Promise<ProggaaUser | null> {
    return mockUsers.find((u) => u.id === proggaaUserId) ?? null;
  }

  async getRole(proggaaUserId: string): Promise<ProggaaRole | null> {
    const user = await this.getUserById(proggaaUserId);
    return user?.role ?? null;
  }
}
