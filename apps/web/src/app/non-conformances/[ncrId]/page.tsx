import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { ncrCarQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function NonConformanceDetailPage({ params }: { params: Promise<{ ncrId: string }> }) {
  const { ncrId } = await params;
  const result = await ncrCarQuery().getMineExternal(ncrId);
  const message = result.availability === "AVAILABLE" ? `${result.detail.ncrNo} · ${result.detail.state}` : result.availability === "NOT_FOUND" ? "NCR을 찾을 수 없습니다." : result.availability === "FORBIDDEN" ? "이 NCR을 조회할 권한이 없습니다." : "NCR/CAR 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="ncr-detail-title">
        <PageBackLink href="/non-conformances">NCR/CAR</PageBackLink>
        <p className="eyebrow">EXTERNAL NCR/CAR DETAIL · EXACT ASSIGNMENT</p>
        <h1 id="ncr-detail-title">NCR/CAR 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <FactGrid facts={[
              { label: "심각도", value: result.detail.severity },
              { label: "현재 상태", value: result.detail.state },
              { label: "조치기한", value: result.detail.dueAt ?? "미지정" },
              { label: "담당 CAR", value: `${result.detail.assignedCars.length}건` },
              { label: "적용 범위", value: result.detail.scopeSummary },
              { label: "발생 근거", value: result.detail.sourceLinks.map((link) => link.externalReference).join(", ") }
            ]} />
            {result.detail.containmentSummary ? <div className="policyCallout warning"><strong>즉시조치</strong><p>{result.detail.containmentSummary}</p></div> : null}
            <section className="detailSection" aria-labelledby="car-list-title">
              <h2 id="car-list-title">할당된 시정조치</h2>
              <ul className="timelineList">
                {result.detail.assignedCars.map((car) => (
                  <li key={car.carId}>
                    <strong>{car.carNo} · {car.state}</strong>
                    <span>원인: {car.rootCause}</span>
                    <span>조치: {car.actionPlan}</span>
                    <span>기한: {car.dueAt}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p className="summary">활성 계정·정확한 Project/Contract Scope와 NCR 책임 할당을 서버와 DB에서 확인한 뒤에만 외부 수행정보를 제공합니다.</p>
        )}
      </section>
    </main>
  );
}
