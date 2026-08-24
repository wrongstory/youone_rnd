import { GearSix, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { SecureActionPreview } from "../../../../interface/app-overlays";
import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../../_components/project-workspace";
import { projectQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  return (
    <ProjectWorkspaceShell project={project} current="/settings" title="프로젝트 설정" description="기본정보와 허용된 상태 전이를 관리하며 미확정 종료 정책은 활성화하지 않습니다.">
      <section className="operationalPanel"><div className="panelHeading"><div><span>PROJECT SETTINGS</span><h2>기본 설정</h2></div><GearSix aria-hidden size={24} /></div><ul className="dataList"><li><span>가시성</span><strong>{project.visibilityCode}</strong></li><li><span>책임자</span><strong>{project.ownerDisplayName}</strong></li><li><span>현재 상태</span><strong>{project.state}</strong></li></ul><SecureActionPreview actionLabel="프로젝트 기본정보 변경" subjectLabel={project.name} /></section><section className="operationalPanel dangerZone"><WarningCircle aria-hidden size={24} /><div><h2>종료·재개 비활성</h2><p>Project 종료 체크리스트 정책 OD-014가 확정되기 전에는 종료·재개 Command와 버튼을 제공하지 않습니다.</p></div><button type="button" disabled>프로젝트 종료</button></section>
    </ProjectWorkspaceShell>
  );
}

