import { availableProjectList, unavailableProjectList } from "@youone/ui/public";
import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { projectQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const result = await projectQuery().listMine();
  const view = result.availability === "AVAILABLE"
    ? availableProjectList(result.items.map((project) => ({
        id: project.projectId,
        projectCode: project.projectCode,
        title: project.name,
        state: project.state,
        formalResearch: project.formalResearch
      })))
    : unavailableProjectList();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="projects-title">
        <PageBackLink />
        <p className="eyebrow">PROJECT · SM-PROJECT-V1</p>
        <h1 id="projects-title">프로젝트</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">
            조회 포트가 구성되기 전에는 프로젝트 수나 정식 연구과제 여부를 추정하지 않습니다.
            정식 연구과제 표시는 연구소장 동의가 완료된 불변 지정 기록에서만 파생됩니다.
          </p>
        ) : (
          <RecordGrid>
            {view.items.map((project) => (
              <RecordCard key={project.id} href={`/projects/${project.id}`} eyebrow={project.projectCode} title={project.title} meta={[`상태 ${project.state}`, project.formalResearch ? "정식 연구과제" : "일반 프로젝트"]} />
            ))}
          </RecordGrid>
        )}
      </section>
    </main>
  );
}
