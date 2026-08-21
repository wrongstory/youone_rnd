import type { ProjectDetailResult, ProjectListResult, ProjectQueryPort } from "@youone/feature-project/public";

class UnavailableProjectQuery implements ProjectQueryPort {
  async listMine(): Promise<ProjectListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getMine(projectId: string): Promise<ProjectDetailResult> {
    void projectId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

export function projectQuery(): ProjectQueryPort {
  return new UnavailableProjectQuery();
}
