import { ClipboardText, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { SecureActionPreview } from "../../../interface/app-overlays";
import { FactGrid } from "../../../interface/preview-ui";
import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../_components/project-workspace";
import { projectQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  return (
    <ProjectWorkspaceShell project={project} current="" title={project.name} description={project.objective} actions={<><SecureActionPreview actionLabel="프로젝트 기본정보 변경" subjectLabel={project.name} /><Link className="primaryActionLink" href={`/projects/${project.projectId}/formal-research-applications/new`}><ClipboardText aria-hidden size={18} />정식 연구과제 신청</Link></>}>
      <div className="projectOverviewGrid">
        <section className="operationalPanel">
          <div className="panelHeading"><div><span>PROJECT FACTS</span><h2>프로젝트 개요</h2></div><PencilSimple aria-hidden size={23} /></div>
            <FactGrid facts={[
              { label: "상태", value: project.state },
              { label: "구분", value: project.formalResearch ? "정식 연구과제" : "일반 프로젝트" },
              { label: "책임자", value: project.ownerDisplayName },
              { label: "기간", value: `${project.periodStart} ~ ${project.periodEnd}` },
              { label: "참여자", value: `${project.members.length}명` },
              { label: "진행 항목", value: `WBS ${project.wbs.length}개` }
            ]} />
        </section>
        <section className="operationalPanel" aria-labelledby="wbs-title">
              <div className="panelHeading"><div><span>WORK BREAKDOWN</span><h2 id="wbs-title">WBS 진행 현황</h2></div><Link href={`/projects/${project.projectId}/wbs`}>전체 관리</Link></div>
              <ul className="workList">
                {project.wbs.map((node) => (
                  <li key={node.wbsNodeId}>
                    <div><strong>{node.title}</strong><span>{node.nodeKind} · {node.state}</span></div>
                    <div className="progressTrack" aria-label={`${node.title} ${node.progressPercent}%`}><span style={{ width: `${node.progressPercent}%` }} /></div>
                    <b>{node.progressPercent}%</b>
                  </li>
                ))}
              </ul>
        </section>
      </div>
    </ProjectWorkspaceShell>
  );
}
