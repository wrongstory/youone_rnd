import type { ApprovalDetailResult, ApprovalInboxQueryPort, ApprovalInboxResult } from "@youone/core-approval/public";
import type { Uuid } from "@youone/shared-kernel/public";

import { previewApprovalDetail, previewApprovalInbox } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

/** Safe fallback: never fabricates rows and never represents an unavailable backend as an empty inbox. */
class UnavailableApprovalInboxQuery implements ApprovalInboxQueryPort {
  async listMine(): Promise<ApprovalInboxResult> { return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async getMine(): Promise<ApprovalDetailResult> { return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
}

class PreviewApprovalInboxQuery implements ApprovalInboxQueryPort {
  async listMine(): Promise<ApprovalInboxResult> {
    return { availability: "AVAILABLE", items: previewApprovalInbox };
  }

  async getMine(approvalInstanceId: Uuid): Promise<ApprovalDetailResult> {
    const detail = previewApprovalDetail(approvalInstanceId);
    return detail
      ? { availability: "AVAILABLE", detail }
      : { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

export function approvalInboxQuery(usePreviewData = previewDataEnabled()): ApprovalInboxQueryPort {
  return usePreviewData ? new PreviewApprovalInboxQuery() : new UnavailableApprovalInboxQuery();
}
