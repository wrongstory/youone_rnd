import { inspectionQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function InspectionDetailPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await params;
  const result = await inspectionQuery().getMineExternal(inspectionId);
  const message = result.availability === "AVAILABLE"
    ? `${result.detail.inspectionNo} · ${result.detail.state}`
    : result.availability === "NOT_FOUND"
      ? "검수 건을 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 검수 건을 조회할 권한이 없습니다."
        : "검수 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="inspection-detail-title">
        <p className="eyebrow">EXTERNAL INSPECTION DETAIL · EXACT SCOPE</p>
        <h1 id="inspection-detail-title">검수 상세</h1>
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <p className="summary">
            외부 판정 {result.detail.latestExternalDisposition ?? "미정"} · 봉인된 검수 시도 {result.detail.attemptHistory.length}건
            {result.detail.correctionRequest ? ` · 시정기한 ${result.detail.correctionRequest.dueAt ?? "미지정"}` : ""}
          </p>
        ) : (
          <p className="summary">
            외주업체의 활성 멤버십과 정확한 프로젝트·계약 Scope를 서버와 DB에서 확인한 뒤에만 외부용 판정·시정
            정보를 제공합니다. 명령 어댑터가 연결되기 전에는 자체 합격이나 지급률 변경 버튼을 제공하지 않습니다.
          </p>
        )}
      </section>
    </main>
  );
}
