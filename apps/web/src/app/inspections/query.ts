import type {
  InspectionExternalDetailResult,
  InspectionExternalListResult,
  InspectionInternalDetailResult,
  InspectionQueryPort
} from "@youone/feature-quality/public";

import { previewInspectionList, previewInspections } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

class UnavailableInspectionQuery implements InspectionQueryPort {
  async listMineExternal(): Promise<InspectionExternalListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getMineExternal(inspectionId: string): Promise<InspectionExternalDetailResult> {
    void inspectionId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getInternalDetail(inspectionId: string): Promise<InspectionInternalDetailResult> {
    void inspectionId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

class PreviewInspectionQuery implements InspectionQueryPort {
  async listMineExternal(): Promise<InspectionExternalListResult> {
    return { availability: "AVAILABLE", items: previewInspectionList };
  }

  async getMineExternal(inspectionId: string): Promise<InspectionExternalDetailResult> {
    const detail = previewInspections.find((inspection) => inspection.inspectionId === inspectionId);
    return detail ? { availability: "AVAILABLE", detail } : { availability: "NOT_FOUND", detail: null };
  }

  async getInternalDetail(): Promise<InspectionInternalDetailResult> {
    return { availability: "FORBIDDEN", detail: null };
  }
}

export function inspectionQuery(usePreviewData = previewDataEnabled()): InspectionQueryPort {
  return usePreviewData ? new PreviewInspectionQuery() : new UnavailableInspectionQuery();
}
