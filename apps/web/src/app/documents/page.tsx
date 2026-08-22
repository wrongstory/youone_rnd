import { availableDocumentList, unavailableDocumentList } from "@youone/ui/public";

import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { documentQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const result = await documentQuery().listMine();
  const view = result.availability === "AVAILABLE"
    ? availableDocumentList(result.items.map((document) => ({
        id: document.documentVersionId,
        documentNo: document.documentNo,
        versionNo: document.versionNo,
        state: document.state,
        securityLevel: document.securityLevel
      })))
    : unavailableDocumentList();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="documents-title">
        <PageBackLink />
        <p className="eyebrow">DOCUMENT · SM-DOCUMENT-V1</p>
        <h1 id="documents-title">내 문서</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {result.availability === "UNAVAILABLE" ? (
          <p className="summary">조회 포트가 구성되기 전에는 문서 수나 접근 권한을 추정하지 않습니다. L3/L4 원문 접근은 별도 서버 판정 없이는 제공되지 않습니다.</p>
        ) : (
          <RecordGrid>
            {result.items.map((document) => (
              <RecordCard
                key={document.documentVersionId}
                href={`/documents/${document.documentVersionId}`}
                eyebrow={`${document.documentNo} · ${document.documentType}`}
                title={document.title}
                meta={[`v${document.versionNo}`, `상태 ${document.state}`, `보안 ${document.securityLevel}`, `갱신 ${document.updatedAt}`]}
              />
            ))}
          </RecordGrid>
        )}
      </section>
    </main>
  );
}
