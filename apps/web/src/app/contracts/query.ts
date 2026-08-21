import type {
  ContractBasicDetailResult,
  ContractFinanceDetailResult,
  ContractListSafeResult,
  VendorContractQueryPort
} from "@youone/feature-contract/public";

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

export function vendorContractQuery(): VendorContractQueryPort {
  return new UnavailableVendorContractQuery();
}
