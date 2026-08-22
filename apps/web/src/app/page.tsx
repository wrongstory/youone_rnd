import Link from "next/link";

import { PreviewNotice } from "../interface/preview-ui";

const foundations = [
  "Deny-by-Default 외주 Scope",
  "불변 결재·문서 증빙",
  "명시적 상태머신과 감사",
  "오프라인 충돌 자동 덮어쓰기 금지"
] as const;

const availablePages = [
  {
    href: "/approvals",
    label: "내 결재함",
    description: "정식 연구과제 승격과 계약 결재 샘플을 확인합니다."
  },
  {
    href: "/documents",
    label: "내 문서",
    description: "승인 문서·검토본·연구노트와 보안등급별 접근 안내를 확인합니다."
  },
  {
    href: "/projects",
    label: "프로젝트",
    description: "일반 프로젝트·정식 연구과제와 WBS 진행현황을 확인합니다."
  },
  {
    href: "/contracts",
    label: "외주 계약",
    description: "업체·계약 Scope와 납품항목 진행현황을 확인합니다."
  },
  {
    href: "/inspections",
    label: "검수 현황",
    description: "검수 판정·달성도·시정요청과 봉인 이력을 확인합니다."
  },
  {
    href: "/non-conformances",
    label: "NCR/CAR",
    description: "부적합·즉시조치·CAR 수행과 외주 안전 조회를 확인합니다."
  },
  {
    href: "/engineering-changes",
    label: "ECR/ECO",
    description: "영향분석·정확한 변경버전·적용·독립 재검증 진행을 확인합니다."
  },
  {
    href: "/purchases",
    label: "구매·입고",
    description: "구매요청·결재·외부 지급확인·분할입고·구매검수 진행을 확인합니다."
  },
  {
    href: "/rnd-programs",
    label: "R&D 과제관리",
    description: "과제별 예산·집행·증빙·보고기한과 집행률을 확인합니다."
  },
  {
    href: "/research-notes",
    label: "연구노트",
    description: "작성·선택적 선임검토·연구소장 확정·불변 PDF 증빙 이력을 확인합니다."
  }
] as const;

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">YOUONE R&amp;D · P0 FOUNDATION</p>
        <h1 id="page-title">연구개발 업무관리 기반을 구축하고 있습니다.</h1>
        <PreviewNotice />
        <p className="summary">
          M00부터 M11까지 개발 통합 브랜치에 병합했고, 현재 M12 경량 연구노트와 불변 PDF 증빙을 개발하고 있습니다.
          아래 화면 목록에서 지금까지 구현된 사용자 경로를 확인할 수 있습니다.
        </p>
        <div className="status" role="status">
          <span className="statusDot" aria-hidden="true" />
          IMPLEMENTATION_ACTIVE · M12
        </div>
      </section>

      <nav className="pageDirectory" aria-labelledby="page-directory-title">
        <h2 id="page-directory-title">현재 확인 가능한 화면</h2>
        <ul>
          <li>
            <Link href="/" aria-current="page">
              <strong>개발 현황 홈</strong>
              <span>현재 병합 단계와 기반 원칙을 확인합니다.</span>
            </Link>
          </li>
          {availablePages.map((page) => (
            <li key={page.href}>
              <Link href={page.href}>
                <strong>{page.label}</strong>
                <span>{page.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="principles" aria-labelledby="principles-title">
        <h2 id="principles-title">변경하지 않는 기반 원칙</h2>
        <ul>
          {foundations.map((foundation) => (
            <li key={foundation}>{foundation}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
