import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { documentQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentVersionId: string }> }) {
  const { documentVersionId } = await params;
  const result = await documentQuery().getMine(documentVersionId);
  const message = result.availability === "AVAILABLE"
    ? `${result.detail.documentNo} · v${result.detail.versionNo}`
    : result.availability === "NOT_FOUND"
      ? "문서를 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 문서를 조회할 권한이 없습니다."
        : "문서 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="document-detail-title">
        <PageBackLink href="/documents">내 문서</PageBackLink>
        <p className="eyebrow">DOCUMENT VERSION · IMMUTABLE SNAPSHOT</p>
        <h1 id="document-detail-title">문서 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <h2 className="detailTitle">{result.detail.title}</h2>
            <p className="summary">{result.detail.summary}</p>
            <FactGrid facts={[
              { label: "문서유형", value: result.detail.documentType },
              { label: "보안등급", value: result.detail.securityLevel },
              { label: "상태", value: result.detail.state },
              { label: "소유자", value: result.detail.ownerDisplayName },
              { label: "프로젝트", value: result.detail.projectCode },
              { label: "최근 갱신", value: result.detail.updatedAt }
            ]} />
            <div className="policyCallout"><strong>접근 정책</strong><p>{result.detail.accessNote}</p></div>
          </>
        ) : (
          <p className="summary">가짜 내용·파일 링크·실행 가능한 버튼을 표시하지 않습니다.</p>
        )}
      </section>
    </main>
  );
}
