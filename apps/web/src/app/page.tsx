const foundations = [
  "Deny-by-Default 외주 Scope",
  "불변 결재·문서 증빙",
  "명시적 상태머신과 감사",
  "오프라인 충돌 자동 덮어쓰기 금지"
] as const;

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">YOUONE R&amp;D · P0 FOUNDATION</p>
        <h1 id="page-title">연구개발 업무관리 기반을 구축하고 있습니다.</h1>
        <p className="summary">
          현재 M00 아키텍처 결정과 M01 프로젝트 스캐폴딩을 진행 중입니다. 업무 기능은 승인된
          순서에 따라 수직 슬라이스로 추가됩니다.
        </p>
        <div className="status" role="status">
          <span className="statusDot" aria-hidden="true" />
          IMPLEMENTATION_ACTIVE · M00/M01
        </div>
      </section>

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
