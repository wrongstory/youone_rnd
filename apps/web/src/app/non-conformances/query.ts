import type {
  NcrCarQueryPort,
  NcrInternalDetailResult,
  NcrVendorDetailResult,
  NcrVendorListResult
} from "@youone/feature-quality/public";

import { previewNcrList, previewNcrs } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

class UnavailableNcrCarQuery implements NcrCarQueryPort {
  async listMineExternal(): Promise<NcrVendorListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getMineExternal(ncrId: string): Promise<NcrVendorDetailResult> {
    void ncrId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getInternalDetail(ncrId: string): Promise<NcrInternalDetailResult> {
    void ncrId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

class PreviewNcrCarQuery implements NcrCarQueryPort {
  async listMineExternal(): Promise<NcrVendorListResult> {
    return { availability: "AVAILABLE", items: previewNcrList };
  }

  async getMineExternal(ncrId: string): Promise<NcrVendorDetailResult> {
    const detail = previewNcrs.find((ncr) => ncr.ncrId === ncrId);
    return detail ? { availability: "AVAILABLE", detail } : { availability: "NOT_FOUND", detail: null };
  }

  async getInternalDetail(): Promise<NcrInternalDetailResult> {
    return { availability: "FORBIDDEN", detail: null };
  }
}

export function ncrCarQuery(usePreviewData = previewDataEnabled()): NcrCarQueryPort {
  return usePreviewData ? new PreviewNcrCarQuery() : new UnavailableNcrCarQuery();
}
