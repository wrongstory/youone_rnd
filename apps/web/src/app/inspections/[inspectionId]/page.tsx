import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { inspectionQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function InspectionDetailPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await params;
  const result = await inspectionQuery().getMineExternal(inspectionId);
  const message = result.availability === "AVAILABLE" ? `${result.detail.inspectionNo} · ${result.detail.state}` : result.availability === "NOT_FOUND" ? "검수 건을 찾을 수 없습니다." : result.availability === "FORBIDDEN" ? "이 검수 건을 조회할 권한이 없습니다." : "검수 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="inspection-detail-title">
        <PageBackLink href="/inspections">검수 현황</PageBackLink>
        <p className="eyebrow">EXTERNAL INSPECTION DETAIL · EXACT SCOPE</p>
        <h1 id="inspection-detail-title">검수 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <FactGrid facts={[
              { label: "검수유형", value: result.detail.inspectionTypeCode },
              { label: "현재 상태", value: result.detail.state },
              { label: "최근 판정", value: result.detail.latestExternalDisposition ?? "미정" },
              { label: "검수 시도", value: `${result.detail.attemptHistory.length}회` },
              { label: "계약", value: result.detail.contractId },
              { label: "고정 납품버전", value: result.detail.deliverableVersionId }
            ]} />
            {result.detail.correctionRequest ? <div className="policyCallout warning"><strong>시정요청</strong><p>{result.detail.correctionRequest.reason}</p><span>기한 {result.detail.correctionRequest.dueAt ?? "미지정"}</span></div> : null}
            <section className="detailSection" aria-labelledby="attempt-history-title">
              <h2 id="attempt-history-title">봉인된 검수 이력</h2>
              <ol className="timelineList">
                {result.detail.attemptHistory.map((attempt) => <li key={attempt.inspectionAttemptId}><strong>{attempt.attemptNo}차 · {attempt.disposition}</strong><span>달성도 {attempt.achievementPercent}% · {attempt.sealedAt}</span></li>)}
              </ol>
            </section>
          </>
        ) : (
          <p className="summary">활성 계정·정확한 Scope를 서버와 DB에서 확인한 뒤에만 외부용 판정·시정 정보를 제공합니다.</p>
        )}
      </section>
    </main>
  );
}
