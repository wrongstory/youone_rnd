export interface NonConformanceListViewItem {
  readonly id: string;
  readonly ncrNo: string;
  readonly severity: string;
  readonly state: string;
  readonly contractId: string;
  readonly deliverableVersionId?: string;
  readonly dueAt?: string;
}

export type NonConformanceListView =
  | {
      readonly availability: "AVAILABLE";
      readonly items: readonly NonConformanceListViewItem[];
      readonly message: string;
    }
  | {
      readonly availability: "UNAVAILABLE";
      readonly items: readonly [];
      readonly message: string;
    };

export function unavailableNonConformanceList(): NonConformanceListView {
  return {
    availability: "UNAVAILABLE",
    items: [],
    message: "NCR/CAR 조회 서비스가 아직 연결되지 않았습니다. 부적합 건이 없다는 뜻이 아닙니다."
  };
}

export function availableNonConformanceList(
  items: readonly NonConformanceListViewItem[]
): NonConformanceListView {
  return {
    availability: "AVAILABLE",
    items: items.map((item) => ({ ...item })),
    message: items.length ? "조회할 수 있는 NCR/CAR가 있습니다." : "현재 조회할 수 있는 NCR/CAR가 없습니다."
  };
}
