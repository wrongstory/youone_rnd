import type {
  PurchaseDetailResult,
  PurchaseListResult,
  PurchaseQueryPort
} from "@youone/feature-purchase/public";

import { previewPurchaseList, previewPurchases } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

class UnavailablePurchaseQuery implements PurchaseQueryPort {
  async listMine(): Promise<PurchaseListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getMine(purchaseRequestId: string): Promise<PurchaseDetailResult> {
    void purchaseRequestId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async listForHeadquartersReadOnly(): Promise<PurchaseListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

class PreviewPurchaseQuery implements PurchaseQueryPort {
  async listMine(): Promise<PurchaseListResult> {
    return { availability: "AVAILABLE", items: previewPurchaseList };
  }

  async getMine(purchaseRequestId: string): Promise<PurchaseDetailResult> {
    const detail = previewPurchases.find((purchase) => purchase.purchaseRequestId === purchaseRequestId);
    return detail ? { availability: "AVAILABLE", detail } : { availability: "NOT_FOUND", detail: null };
  }

  async listForHeadquartersReadOnly(): Promise<PurchaseListResult> {
    return { availability: "AVAILABLE", items: previewPurchaseList };
  }
}

export function purchaseQuery(usePreviewData = previewDataEnabled()): PurchaseQueryPort {
  return usePreviewData ? new PreviewPurchaseQuery() : new UnavailablePurchaseQuery();
}
