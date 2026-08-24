export type AppNavigationItem = Readonly<{
  href: string;
  label: string;
  description?: string;
}>;

export type AppNavigationGroup = Readonly<{
  id: string;
  label: string;
  items: readonly AppNavigationItem[];
}>;

export const primaryNavigation = Object.freeze([
  { href: "/", label: "대시보드" },
  { href: "/approvals", label: "결재" },
  { href: "/projects", label: "프로젝트" },
  { href: "/documents", label: "문서" }
] as const);

export const navigationGroups: readonly AppNavigationGroup[] = Object.freeze([
  {
    id: "approval",
    label: "결재",
    items: [
      { href: "/approvals", label: "내 결재함", description: "내가 처리할 결재" },
      { href: "/approvals/submitted", label: "상신한 결재", description: "내가 올린 결재" },
      { href: "/approvals/completed", label: "완료된 결재", description: "승인·반려 이력" },
      { href: "/settings/approval", label: "결재 설정", description: "버전형 결재 정책 조회" }
    ]
  },
  {
    id: "project",
    label: "프로젝트·연구",
    items: [
      { href: "/projects", label: "프로젝트·WBS" },
      { href: "/projects/formal-research-applications", label: "정식 연구과제 신청" },
      { href: "/rnd-programs", label: "R&D 과제관리" },
      { href: "/research-notes", label: "연구노트" }
    ]
  },
  {
    id: "document",
    label: "문서·기술자료",
    items: [
      { href: "/documents", label: "문서관리" },
      { href: "/technical-copies", label: "L3/L4 통제사본" }
    ]
  },
  {
    id: "vendor-quality",
    label: "외주·품질",
    items: [
      { href: "/contracts", label: "외주 계약" },
      { href: "/inspections", label: "검수 현황" },
      { href: "/non-conformances", label: "NCR/CAR" },
      { href: "/engineering-changes", label: "ECR/ECO" }
    ]
  },
  {
    id: "operations",
    label: "구매·운영",
    items: [
      { href: "/purchases", label: "구매·입고" },
      { href: "/safety", label: "안전관리" },
      { href: "/offline-sync", label: "오프라인·동기화" }
    ]
  },
  {
    id: "system",
    label: "시스템 관리",
    items: [
      { href: "/settings/users", label: "사용자 관리" },
      { href: "/settings/vendors", label: "외주 계정 관리" },
      { href: "/settings/organization", label: "조직·부서·직책" },
      { href: "/settings/access", label: "역할·권한 현황" },
      { href: "/settings/security", label: "세션·MFA 보안" },
      { href: "/settings/audit", label: "감사 로그" }
    ]
  }
]);
