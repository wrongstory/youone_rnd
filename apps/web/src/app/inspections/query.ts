import type {
  InspectionExternalDetailResult,
  InspectionExternalListResult,
  InspectionInternalDetailResult,
  InspectionQueryPort
} from "@youone/feature-quality/public";

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

export function inspectionQuery(): InspectionQueryPort {
  return new UnavailableInspectionQuery();
}
