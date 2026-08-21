import { projectQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  const message = result.availability === "AVAILABLE"
    ? `${result.detail.projectCode} · ${result.detail.name}`
    : result.availability === "NOT_FOUND"
      ? "프로젝트를 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 프로젝트를 조회할 권한이 없습니다."
        : "프로젝트 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="project-detail-title">
        <p className="eyebrow">PROJECT · WBS · FORMAL DESIGNATION</p>
        <h1 id="project-detail-title">프로젝트 상세</h1>
        <div className="status" role="status" data-availability={result.availability}>
          {message}
        </div>
        {result.availability === "AVAILABLE" ? (
          <p className="summary">
            {result.detail.state} · WBS {result.detail.wbs.length}개 ·
            {result.detail.formalResearch ? " 정식 연구과제" : " 일반 프로젝트"}
          </p>
        ) : (
          <p className="summary">
            가짜 WBS, 구성원 또는 정식 연구과제 표시를 만들지 않습니다. 생성·상태변경·승격 신청 버튼도
            서버 권한 및 명령 어댑터가 연결되기 전에는 제공하지 않습니다.
          </p>
        )}
      </section>
    </main>
  );
}
