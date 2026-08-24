import { TreeStructure } from "@phosphor-icons/react/dist/ssr";

import { SecureActionPreview } from "../../../../interface/app-overlays";
import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../../_components/project-workspace";
import { projectQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function ProjectWbsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  return (
    <ProjectWorkspaceShell project={project} current="/wbs" title="WBS 관리" description="자유계층 업무를 생성하고 담당·기간·진행률·상태를 관리합니다." actions={<SecureActionPreview actionLabel="최상위 WBS 생성" subjectLabel={project.name} />}>
      <section className="operationalPanel"><div className="panelHeading"><div><span>WORK BREAKDOWN STRUCTURE</span><h2>계층형 업무</h2></div><TreeStructure aria-hidden size={24} /></div><ul className="wbsManagementList">{project.wbs.map((node, index) => <li style={{ "--wbs-depth": index === 0 ? 0 : 1 } as React.CSSProperties} key={node.wbsNodeId}><div className="wbsHierarchyMarker" /><div><span>{node.nodeKind}</span><strong>{node.title}</strong><small>{node.state} · version {node.version}</small></div><div className="wbsProgress"><span><i style={{ width: `${node.progressPercent}%` }} /></span><b>{node.progressPercent}%</b></div><SecureActionPreview actionLabel="WBS 변경" subjectLabel={node.title} /></li>)}</ul></section>
    </ProjectWorkspaceShell>
  );
}

