import type {
  NcrCarQueryPort,
  NcrInternalDetailResult,
  NcrVendorDetailResult,
  NcrVendorListResult
} from "@youone/feature-quality/public";

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

export function ncrCarQuery(): NcrCarQueryPort {
  return new UnavailableNcrCarQuery();
}
