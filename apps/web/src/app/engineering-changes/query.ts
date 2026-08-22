import {
  projectVendorChangeDetail,
  projectVendorChangeListItem,
  type ChangeInternalDetailResult,
  type ChangeQueryPort,
  type ChangeVendorDetailResult,
  type ChangeVendorListResult
} from "@youone/feature-change/public";

import { previewChangeList, previewChanges } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

class UnavailableChangeQuery implements ChangeQueryPort {
  async listMineExternal(): Promise<ChangeVendorListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getMineExternal(changeRequestId: string): Promise<ChangeVendorDetailResult> {
    void changeRequestId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getInternalDetail(changeRequestId: string): Promise<ChangeInternalDetailResult> {
    void changeRequestId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

class PreviewChangeQuery implements ChangeQueryPort {
  async listMineExternal(): Promise<ChangeVendorListResult> {
    return { availability: "AVAILABLE", items: previewChangeList.map(projectVendorChangeListItem) };
  }

  async getMineExternal(changeRequestId: string): Promise<ChangeVendorDetailResult> {
    const detail = previewChanges.find((change) => change.changeRequestId === changeRequestId);
    return detail ? { availability: "AVAILABLE", detail: projectVendorChangeDetail(detail) } : { availability: "NOT_FOUND", detail: null };
  }

  async getInternalDetail(): Promise<ChangeInternalDetailResult> {
    return { availability: "FORBIDDEN", detail: null };
  }
}

export function engineeringChangeQuery(usePreviewData = previewDataEnabled()): ChangeQueryPort {
  return usePreviewData ? new PreviewChangeQuery() : new UnavailableChangeQuery();
}
