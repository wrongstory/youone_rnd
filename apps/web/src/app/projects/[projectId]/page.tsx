import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
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
        <PageBackLink href="/projects">프로젝트</PageBackLink>
        <p className="eyebrow">PROJECT · WBS · FORMAL DESIGNATION</p>
        <h1 id="project-detail-title">프로젝트 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <p className="summary">{result.detail.objective}</p>
            <FactGrid facts={[
              { label: "상태", value: result.detail.state },
              { label: "구분", value: result.detail.formalResearch ? "정식 연구과제" : "일반 프로젝트" },
              { label: "책임자", value: result.detail.ownerDisplayName },
              { label: "기간", value: `${result.detail.periodStart} ~ ${result.detail.periodEnd}` },
              { label: "참여자", value: `${result.detail.members.length}명` },
              { label: "진행 항목", value: `WBS ${result.detail.wbs.length}개` }
            ]} />
            <section className="detailSection" aria-labelledby="wbs-title">
              <h2 id="wbs-title">WBS 진행 현황</h2>
              <ul className="workList">
                {result.detail.wbs.map((node) => (
                  <li key={node.wbsNodeId}>
                    <div><strong>{node.title}</strong><span>{node.nodeKind} · {node.state}</span></div>
                    <div className="progressTrack" aria-label={`${node.title} ${node.progressPercent}%`}><span style={{ width: `${node.progressPercent}%` }} /></div>
                    <b>{node.progressPercent}%</b>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p className="summary">가짜 WBS, 구성원 또는 정식 연구과제 표시를 만들지 않습니다. 서버 권한 및 명령 어댑터가 연결되기 전에는 변경 버튼도 제공하지 않습니다.</p>
        )}
      </section>
    </main>
  );
}
