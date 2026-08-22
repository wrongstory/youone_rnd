import { previewDataEnabled } from "../../composition/preview-mode";

export interface DocumentListItem {
  readonly documentVersionId: string;
  readonly documentNo: string;
  readonly title: string;
  readonly documentType: string;
  readonly versionNo: number;
  readonly state: "DRAFT" | "IN_REVIEW" | "APPROVED";
  readonly securityLevel: "L1" | "L2" | "L3" | "L4";
  readonly updatedAt: string;
}

export interface DocumentDetail extends DocumentListItem {
  readonly ownerDisplayName: string;
  readonly projectCode: string;
  readonly summary: string;
  readonly accessNote: string;
}

export type DocumentListResult =
  | { readonly availability: "AVAILABLE"; readonly items: readonly DocumentListItem[] }
  | { readonly availability: "UNAVAILABLE"; readonly items: readonly []; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export type DocumentDetailResult =
  | { readonly availability: "AVAILABLE"; readonly detail: DocumentDetail }
  | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null }
  | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface DocumentQueryPort {
  listMine(): Promise<DocumentListResult>;
  getMine(id: string): Promise<DocumentDetailResult>;
}

const previewDocuments: readonly DocumentDetail[] = Object.freeze([
  {
    documentVersionId: "f0000000-0000-4000-8000-000000000001",
    documentNo: "RND-DOC-2026-041",
    title: "배터리 냉각모듈 요구사항 명세서",
    documentType: "기술 요구사항",
    versionNo: 3,
    state: "APPROVED",
    securityLevel: "L2",
    updatedAt: "2026-08-20T04:30:00Z",
    ownerDisplayName: "김도윤 책임연구원",
    projectCode: "RND-2026-004",
    summary: "열편차, 유량, 압력손실 및 환경시험 기준을 고정한 승인본입니다.",
    accessNote: "현재 사용자에게 승인본 열람 권한이 있습니다. 외부 반출은 별도 승인이 필요합니다."
  },
  {
    documentVersionId: "f0000000-0000-4000-8000-000000000002",
    documentNo: "RND-DOC-2026-044",
    title: "냉각채널 가공도면",
    documentType: "기술도면",
    versionNo: 5,
    state: "IN_REVIEW",
    securityLevel: "L3",
    updatedAt: "2026-08-21T07:45:00Z",
    ownerDisplayName: "이서연 연구원",
    projectCode: "RND-2026-004",
    summary: "1차 시제품 가공을 위한 냉각채널 형상 및 공차 검토본입니다.",
    accessNote: "L3 원문 다운로드·사용자 직접 출력은 제공하지 않습니다. 승인된 워터마크 통제본만 전달할 수 있습니다."
  },
  {
    documentVersionId: "f0000000-0000-4000-8000-000000000003",
    documentNo: "RND-NOTE-2026-019",
    title: "열유동 해석 연구노트",
    documentType: "연구노트",
    versionNo: 2,
    state: "DRAFT",
    securityLevel: "L2",
    updatedAt: "2026-08-22T00:15:00Z",
    ownerDisplayName: "정수빈 연구원",
    projectCode: "RND-2026-004",
    summary: "채널 형상별 온도분포와 압력손실 비교 결과를 기록 중입니다.",
    accessNote: "작성자와 과제 참여자에게만 초안 열람 권한이 있습니다."
  }
]);

class UnavailableDocumentQuery implements DocumentQueryPort {
  async listMine(): Promise<DocumentListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getMine(): Promise<DocumentDetailResult> {
    return { availability: "UNAVAILABLE", detail: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }
}

class PreviewDocumentQuery implements DocumentQueryPort {
  async listMine(): Promise<DocumentListResult> {
    return { availability: "AVAILABLE", items: previewDocuments };
  }

  async getMine(id: string): Promise<DocumentDetailResult> {
    const detail = previewDocuments.find((document) => document.documentVersionId === id);
    return detail ? { availability: "AVAILABLE", detail } : { availability: "NOT_FOUND", detail: null };
  }
}

export function documentQuery(usePreviewData = previewDataEnabled()): DocumentQueryPort {
  return usePreviewData ? new PreviewDocumentQuery() : new UnavailableDocumentQuery();
}
