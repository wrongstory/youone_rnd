export default function Loading() {
  return (
    <main className="shell" aria-busy="true" aria-live="polite">
      <section className="hero loadingState">
        <span className="loadingLine isShort" />
        <span className="loadingLine isTitle" />
        <span className="loadingLine" />
        <div className="loadingCards"><span /><span /><span /><span /></div>
        <p>업무 정보를 안전하게 불러오는 중입니다.</p>
      </section>
    </main>
  );
}

