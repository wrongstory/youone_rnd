import type { ResearchNoteState } from "@youone/feature-research-note/public";

import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { researchNoteQuery } from "../query";

export const dynamic = "force-dynamic";

const stages: readonly { state: ResearchNoteState; label: string }[] = [
  { state: "DRAFT", label: "작성" }, { state: "SENIOR_REVIEW_PENDING", label: "선임검토(선택)" },
  { state: "REVISION_REQUIRED", label: "수정 필요" }, { state: "DIRECTOR_FINALIZATION_PENDING", label: "연구소장 확정" },
  { state: "FINALIZED", label: "PDF 증빙묶음" }, { state: "CORRECTED_BY_ADDENDUM", label: "추가기록 정정" },
  { state: "VOIDED_BY_POLICY", label: "정책상 무효화" }
];

export default async function ResearchNoteDetailPage({ params }: { params: Promise<{ researchNoteId: string }> }) {
  const { researchNoteId } = await params;
  const result = await researchNoteQuery().getInternal(researchNoteId);
  const message = result.availability === "AVAILABLE" ? result.detail.noteNo : result.availability === "NOT_FOUND" ? "연구노트를 찾을 수 없습니다." : result.availability === "FORBIDDEN" ? "이 연구노트를 조회할 권한이 없습니다." : "연구노트 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="research-note-detail-title">
        <PageBackLink href="/research-notes">연구노트</PageBackLink>
        <p className="eyebrow">APPEND-ONLY ENTRY · NO REPRESENTATIVE APPROVAL · PRIVATE PDF</p>
        <h1 id="research-note-detail-title">연구노트 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? <>
          <FactGrid facts={[
            { label: "제목", value: result.detail.title }, { label: "작성자", value: result.detail.authorDisplayName },
            { label: "연구일", value: result.detail.researchDate }, { label: "현재 상태", value: result.detail.state },
            { label: "Project", value: result.detail.projectLinks.map((link) => `${link.projectCode} ${link.projectName}`).join(", ") },
            { label: "R&D 과제", value: result.detail.rndProgramLinks.map((link) => `${link.programCode} ${link.title}`).join(", ") }
          ]} />

          <section className="detailSection" aria-labelledby="note-stage-title">
            <h2 id="note-stage-title">확정 단계</h2>
            <ol className="timelineList">
              {stages.map((stage) => {
                const skipped = stage.state === "SENIOR_REVIEW_PENDING" && result.detail.seniorReviewPath === "SKIPPED_BY_POLICY";
                const current = stage.state === result.detail.state;
                return <li key={stage.state}><strong>{stage.label}</strong><span>{skipped ? "정책에 따라 생략 · 공식승인 아님" : current ? "현재 단계" : "이력 또는 후속 단계"}</span></li>;
              })}
            </ol>
          </section>

          <section className="detailSection" aria-labelledby="note-entry-title">
            <h2 id="note-entry-title">Entry 이력</h2>
            <ol className="timelineList">
              {result.detail.entries.map((entry) => <li key={entry.entryId}>
                <strong>#{entry.sequenceNo} {entry.entryType} · {entry.heading}</strong>
                <span>{entry.summary}</span><span>체크섬 {entry.contentChecksum} · {entry.recordedAt}</span>
                {entry.correctsEntryId ? <span>연결된 이전 Entry: {entry.correctsEntryId} — 원문 덮어쓰기 없음</span> : null}
              </li>)}
            </ol>
          </section>

          <section className="detailSection" aria-labelledby="note-review-title">
            <h2 id="note-review-title">검토·확정 증적</h2>
            {result.detail.seniorReview ? <div className="policyCallout"><strong>선임 검토 · 공식승인 아님</strong><p>{result.detail.seniorReview.reviewerDisplayName} · {result.detail.seniorReview.outcome}<br />{result.detail.seniorReview.comment}</p></div> : <p className="summary">선임검토는 정책에 따라 생략되었습니다.</p>}
            {result.detail.directorFinalization ? <div className="policyCallout"><strong>연구소장 확정</strong><p>{result.detail.directorFinalization.finalizedByDisplayName} · v{result.detail.directorFinalization.finalizedVersion} · {result.detail.directorFinalization.finalizedAt}<br />Snapshot {result.detail.directorFinalization.finalizedSnapshotChecksum}<br />대표 결재 포함: 아니오</p></div> : <p className="summary">연구소장 확정 대기 중입니다.</p>}
          </section>

          <section className="detailSection" aria-labelledby="note-pdf-title">
            <h2 id="note-pdf-title">PDF 증빙 Manifest</h2>
            {result.detail.pdfEvidence ? <FactGrid facts={[
              { label: "DocumentVersion", value: result.detail.pdfEvidence.documentVersionId }, { label: "Manifest schema", value: `${result.detail.pdfEvidence.manifestSchemaId} v${result.detail.pdfEvidence.manifestSchemaVersion}` },
              { label: "Manifest checksum", value: result.detail.pdfEvidence.manifestChecksum }, { label: "PDF content hash", value: result.detail.pdfEvidence.pdfContentHash },
              { label: "Renderer", value: `${result.detail.pdfEvidence.rendererId} ${result.detail.pdfEvidence.rendererVersion}` }, { label: "페이지", value: `${result.detail.pdfEvidence.pageCount}쪽` },
              { label: "전달", value: "권한 확인 후 비공개 전달" }, { label: "원문 전달", value: "차단" }
            ]} /> : <p className="summary">연구소장 확정 후 서버가 불변 Manifest와 PDF hash를 생성합니다.</p>}
          </section>
        </> : <p className="summary">UI 숨김은 권한이 아닙니다. 서버 판정과 필드 투영이 성공한 경우에만 검토·확정 증적을 제공합니다.</p>}
      </section>
    </main>
  );
}
