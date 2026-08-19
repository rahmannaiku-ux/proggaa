import type { ExamResult } from "../../../types/domain";
import type { ProggaaResultService } from "../interfaces";
import { mockResults } from "./mockData";

export class MockProggaaResultService implements ProggaaResultService {
  async getResultsForStudent(proggaaUserId: string): Promise<ExamResult[]> {
    return mockResults.filter((r) => r.userId === proggaaUserId);
  }

  async getResultById(resultId: string): Promise<ExamResult | null> {
    return mockResults.find((r) => r.id === resultId) ?? null;
  }

  async getPendingManualGradingCount(_examId: string): Promise<number> {
    return 27; // demo value, matches the sample copy in the spec
  }
}
