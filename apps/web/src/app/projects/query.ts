import type { ProjectDetailResult, ProjectListResult, ProjectQueryPort } from "@youone/feature-project/public";

import { previewProjectList, previewProjects } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

class UnavailableProjectQuery implements ProjectQueryPort {
  async listMine(): Promise<ProjectListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getMine(projectId: string): Promise<ProjectDetailResult> {
    void projectId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

class PreviewProjectQuery implements ProjectQueryPort {
  async listMine(): Promise<ProjectListResult> {
    return { availability: "AVAILABLE", items: previewProjectList };
  }

  async getMine(projectId: string): Promise<ProjectDetailResult> {
    const detail = previewProjects.find((project) => project.projectId === projectId);
    return detail ? { availability: "AVAILABLE", detail } : { availability: "NOT_FOUND", detail: null };
  }
}

export function projectQuery(usePreviewData = previewDataEnabled()): ProjectQueryPort {
  return usePreviewData ? new PreviewProjectQuery() : new UnavailableProjectQuery();
}
