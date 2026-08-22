import type {
  ContractBasicDetailResult,
  ContractFinanceDetailResult,
  ContractListSafeResult,
  VendorContractQueryPort
} from "@youone/feature-contract/public";

import { previewContractFinance, previewContractList, previewContracts } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

class UnavailableVendorContractQuery implements VendorContractQueryPort {
  async listSafe(): Promise<ContractListSafeResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getBasicDetail(contractId: string): Promise<ContractBasicDetailResult> {
    void contractId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getFinanceDetail(contractId: string): Promise<ContractFinanceDetailResult> {
    void contractId;
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

class PreviewVendorContractQuery implements VendorContractQueryPort {
  async listSafe(): Promise<ContractListSafeResult> {
    return { availability: "AVAILABLE", items: previewContractList };
  }

  async getBasicDetail(contractId: string): Promise<ContractBasicDetailResult> {
    const detail = previewContracts.find((contract) => contract.contractId === contractId);
    return detail ? { availability: "AVAILABLE", detail } : { availability: "NOT_FOUND", detail: null };
  }

  async getFinanceDetail(contractId: string): Promise<ContractFinanceDetailResult> {
    const detail = previewContractFinance(contractId);
    return detail ? { availability: "AVAILABLE", detail } : { availability: "NOT_FOUND", detail: null };
  }
}

export function vendorContractQuery(usePreviewData = previewDataEnabled()): VendorContractQueryPort {
  return usePreviewData ? new PreviewVendorContractQuery() : new UnavailableVendorContractQuery();
}
