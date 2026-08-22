import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { researchNoteQuery } from "./query";

export const dynamic = "force-dynamic";

const stateLabel = { DRAFT: "작성 중", SENIOR_REVIEW_PENDING: "선임검토 대기", REVISION_REQUIRED: "수정 필요", DIRECTOR_FINALIZATION_PENDING: "연구소장 확정 대기", FINALIZED: "확정", CORRECTED_BY_ADDENDUM: "추가기록으로 정정", VOIDED_BY_POLICY: "정책에 따라 무효" } as const;

export default async function ResearchNotesPage() {
  const result = await researchNoteQuery().listInternal();
  const message = result.availability === "AVAILABLE"
    ? result.items.length ? "조회 가능한 연구노트가 있습니다." : "현재 조회 가능한 연구노트가 없습니다."
    : result.availability === "FORBIDDEN" ? "연구노트를 조회할 권한이 없습니다." : "연구노트 조회 서비스가 아직 연결되지 않았습니다. 기록이 없다는 뜻이 아닙니다.";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="research-note-title">
        <PageBackLink />
        <p className="eyebrow">RESEARCH NOTE · OPTIONAL SENIOR REVIEW · DIRECTOR FINALIZATION</p>
        <h1 id="research-note-title">연구노트</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <RecordGrid>
            {result.items.map((note) => (
              <RecordCard key={note.researchNoteId} href={`/research-notes/${note.researchNoteId}`} eyebrow={`${note.noteNo} · ${stateLabel[note.state]}`} title={note.title}
                meta={[note.authorDisplayName, note.researchDate, `기록 ${note.entryCount}건`, note.seniorReviewPath === "SKIPPED_BY_POLICY" ? "선임검토 생략" : `선임검토 ${note.seniorReviewPath}`]}>
                <p className="summary">{note.projectLinks.map((link) => link.projectCode).join(", ")} · {note.rndProgramLinks.map((link) => link.programCode).join(", ")}</p>
              </RecordCard>
            ))}
          </RecordGrid>
        ) : <p className="summary">활성 내부 사용자의 업무 범위를 서버에서 확인한 뒤에만 목록을 제공합니다. 외주업체와 Admin-System 기본 권한에는 연구노트 원문이 포함되지 않습니다.</p>}
      </section>
    </main>
  );
}
