import Link from "next/link";

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
    description: "M04 공통 결재 엔진의 안전한 조회 경계와 미연결 상태를 확인합니다."
  }
] as const;

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">YOUONE R&amp;D · P0 FOUNDATION</p>
        <h1 id="page-title">연구개발 업무관리 기반을 구축하고 있습니다.</h1>
        <p className="summary">
          M00부터 M04까지 병합을 완료했고, 현재 M05 문서·양식·파일 기능을 개발하고 있습니다.
          아래 화면 목록에서 지금까지 구현된 사용자 경로를 확인할 수 있습니다.
        </p>
        <div className="status" role="status">
          <span className="statusDot" aria-hidden="true" />
          IMPLEMENTATION_ACTIVE · M05
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
