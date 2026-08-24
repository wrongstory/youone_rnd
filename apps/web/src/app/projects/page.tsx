import { availableProjectList, unavailableProjectList } from "@youone/ui/public";
import { ClipboardText, FolderPlus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { OperationalPageHeader } from "../../interface/operational-ui";
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
      <section className="hero">
        <PageBackLink />
        <OperationalPageHeader eyebrow="PROJECT · SM-PROJECT-V1" title="프로젝트" description="일반 프로젝트를 생성하고 WBS·구성원·연구 연결과 정식 연구과제 신청을 관리합니다." actions={<><Link className="secondaryActionLink" href="/projects/formal-research-applications"><ClipboardText aria-hidden size={18} />정식 연구과제 신청</Link><Link className="primaryActionLink" href="/projects/new"><FolderPlus aria-hidden size={18} />새 프로젝트</Link></>} />
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">
            조회 포트가 구성되기 전에는 프로젝트 수나 정식 연구과제 여부를 추정하지 않습니다.
            정식 연구과제 표시는 연구소장 동의가 완료된 불변 지정 기록에서만 파생됩니다.
          </p>
        ) : (<><div className="filterBar projectFilterBar"><label><span>범위</span><select defaultValue="ALL"><option value="ALL">전체 프로젝트</option><option value="MINE">내 프로젝트</option></select></label><label><span>정렬</span><select defaultValue="UPDATED"><option value="UPDATED">최근 업데이트순</option><option value="NAME">프로젝트명순</option></select></label></div><RecordGrid>
            {view.items.map((project) => (
              <RecordCard key={project.id} href={`/projects/${project.id}`} eyebrow={project.projectCode} title={project.title} meta={[`상태 ${project.state}`, project.formalResearch ? "정식 연구과제" : "일반 프로젝트"]} />
            ))}
          </RecordGrid></>
        )}
      </section>
    </main>
  );
}
