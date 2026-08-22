import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { technicalCopyQuery, type TechnicalCopyState } from "./query";

export const dynamic = "force-dynamic";

const stateLabel: Record<TechnicalCopyState, string> = {
  REQUESTED: "신청",
  APPROVAL_PENDING: "결재 대기",
  APPROVED: "승인 완료",
  RENDERED: "PDF 생성",
  PRINTED: "내부 출력",
  HANDED_OVER: "인계 완료",
  RETURN_DUE: "반납 예정",
  RETURNED: "반납 완료",
  DESTROYED: "파기 완료",
  OVERDUE: "기한 초과",
  CANCELLED: "취소"
};

export default async function TechnicalCopiesPage() {
  const result = await technicalCopyQuery().listInternal();
  const message = result.availability === "AVAILABLE"
    ? result.items.length > 0 ? "승인·출력·인계 상태를 확인할 통제사본이 있습니다." : "현재 조회 가능한 통제사본이 없습니다."
    : result.availability === "FORBIDDEN" ? "통제사본 대장을 조회할 권한이 없습니다." : "통제사본 조회 서비스가 연결되지 않았습니다. 기록이 없다는 뜻이 아닙니다.";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="technical-copy-title">
        <PageBackLink />
        <p className="eyebrow">L3/L4 · EXACT VERSION · CONTROLLED PRINT &amp; CUSTODY</p>
        <h1 id="technical-copy-title">기술자료 통제사본</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <RecordGrid>
            {result.items.map((copy) => (
              <RecordCard
                key={copy.technicalCopyId}
                href={`/technical-copies/${copy.technicalCopyId}`}
                eyebrow={`${copy.copyNo ?? copy.requestNo} · ${copy.securityLevel} · ${stateLabel[copy.state]}`}
                title={copy.documentTitle}
                meta={[`${copy.documentNo} v${copy.versionNo}`, copy.recipientDisplayName, `반납기한 ${copy.returnDueAt}`]}
              >
                <p className="summary">{copy.projectLabel}<br />목적: {copy.purpose}</p>
              </RecordCard>
            ))}
          </RecordGrid>
        ) : (
          <p className="summary">서버의 신뢰 ActorContext와 L3/L4 권한 판정 후에만 표시합니다. 외주업체 원문 다운로드·자체 출력 경로는 제공하지 않습니다.</p>
        )}
      </section>
    </main>
  );
}
