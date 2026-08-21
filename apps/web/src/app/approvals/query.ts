import type { ApprovalDetailResult, ApprovalInboxQueryPort, ApprovalInboxResult } from "@youone/core-approval/public";

/** Safe fallback: never fabricates rows and never represents an unavailable backend as an empty inbox. */
class UnavailableApprovalInboxQuery implements ApprovalInboxQueryPort {
  async listMine(): Promise<ApprovalInboxResult> { return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
  async getMine(): Promise<ApprovalDetailResult> { return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" }; }
}

export function approvalInboxQuery(): ApprovalInboxQueryPort { return new UnavailableApprovalInboxQuery(); }
