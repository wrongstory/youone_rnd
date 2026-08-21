export interface ProjectListViewItem {
  readonly id: string;
  readonly projectCode: string;
  readonly title: string;
  readonly state: string;
  readonly formalResearch: boolean;
}

export type ProjectListView =
  | {
      readonly availability: "AVAILABLE";
      readonly items: readonly ProjectListViewItem[];
      readonly message: string;
    }
  | {
      readonly availability: "UNAVAILABLE";
      readonly items: readonly [];
      readonly message: string;
    };

export function unavailableProjectList(): ProjectListView {
  return {
    availability: "UNAVAILABLE",
    items: [],
    message: "프로젝트 조회 서비스가 아직 연결되지 않았습니다. 프로젝트가 없다는 뜻이 아닙니다."
  };
}

export function availableProjectList(items: readonly ProjectListViewItem[]): ProjectListView {
  return {
    availability: "AVAILABLE",
    items: items.map((item) => ({ ...item })),
    message: items.length ? "참여 중인 프로젝트가 있습니다." : "현재 참여 중인 프로젝트가 없습니다."
  };
}
