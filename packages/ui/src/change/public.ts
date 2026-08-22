export interface EngineeringChangeListViewItem {
  readonly id: string;
  readonly ecrNo: string;
  readonly ecoNo?: string;
  readonly state: string;
  readonly priority: string;
  readonly title: string;
  readonly contractId?: string;
  readonly nextAction: string;
}

export type EngineeringChangeListView =
  | {
      readonly availability: "AVAILABLE";
      readonly items: readonly EngineeringChangeListViewItem[];
      readonly message: string;
    }
  | {
      readonly availability: "UNAVAILABLE";
      readonly items: readonly [];
      readonly message: string;
    };

export function unavailableEngineeringChangeList(): EngineeringChangeListView {
  return {
    availability: "UNAVAILABLE",
    items: [],
    message: "ECR/ECO 조회 서비스가 아직 연결되지 않았습니다. 변경 건이 없다는 뜻이 아닙니다."
  };
}

export function availableEngineeringChangeList(
  items: readonly EngineeringChangeListViewItem[]
): EngineeringChangeListView {
  return {
    availability: "AVAILABLE",
    items: items.map((item) => ({ ...item })),
    message: items.length ? "조회할 수 있는 ECR/ECO가 있습니다." : "현재 조회할 수 있는 ECR/ECO가 없습니다."
  };
}
