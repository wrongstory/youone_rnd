export interface InspectionListViewItem {
  readonly id: string;
  readonly inspectionNo: string;
  readonly inspectionTypeCode: string;
  readonly state: string;
  readonly contractId: string;
  readonly deliverableVersionId: string;
  readonly latestExternalDisposition?: string;
}

export type InspectionListView =
  | {
      readonly availability: "AVAILABLE";
      readonly items: readonly InspectionListViewItem[];
      readonly message: string;
    }
  | {
      readonly availability: "UNAVAILABLE";
      readonly items: readonly [];
      readonly message: string;
    };

export function unavailableInspectionList(): InspectionListView {
  return {
    availability: "UNAVAILABLE",
    items: [],
    message: "검수 조회 서비스가 아직 연결되지 않았습니다. 검수 건이 없다는 뜻이 아닙니다."
  };
}

export function availableInspectionList(items: readonly InspectionListViewItem[]): InspectionListView {
  return {
    availability: "AVAILABLE",
    items: items.map((item) => ({ ...item })),
    message: items.length ? "조회할 수 있는 검수 건이 있습니다." : "현재 조회할 수 있는 검수 건이 없습니다."
  };
}
