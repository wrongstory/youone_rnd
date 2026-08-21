export interface ContractListViewItem {
  readonly id: string;
  readonly contractNo: string;
  readonly vendorName: string;
  readonly state: string;
  readonly projectCount: number;
  readonly currentVersionNo?: number;
}

export type ContractListView =
  | {
      readonly availability: "AVAILABLE";
      readonly items: readonly ContractListViewItem[];
      readonly message: string;
    }
  | {
      readonly availability: "UNAVAILABLE";
      readonly items: readonly [];
      readonly message: string;
    };

export function unavailableContractList(): ContractListView {
  return {
    availability: "UNAVAILABLE",
    items: [],
    message: "계약 조회 서비스가 아직 연결되지 않았습니다. 계약이 없다는 뜻이 아닙니다."
  };
}

export function availableContractList(items: readonly ContractListViewItem[]): ContractListView {
  return {
    availability: "AVAILABLE",
    items: items.map((item) => ({ ...item })),
    message: items.length ? "조회할 수 있는 계약이 있습니다." : "현재 조회할 수 있는 계약이 없습니다."
  };
}
