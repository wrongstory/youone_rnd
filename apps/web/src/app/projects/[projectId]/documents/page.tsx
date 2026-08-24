import { FileText, Stamp } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../../_components/project-workspace";
import { projectQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  return (
    <ProjectWorkspaceShell project={project} current="/documents" title="문서·결재" description="프로젝트에 연결된 문서 버전과 결재 subject를 별도 생애주기로 조회합니다.">
      <div className="operationalCardGrid"><Link className="workspaceLinkCard" href="/documents"><FileText aria-hidden size={28} /><span><strong>프로젝트 문서</strong><small>DocumentVersion·첨부·보안등급</small></span></Link><Link className="workspaceLinkCard" href="/approvals"><Stamp aria-hidden size={28} /><span><strong>프로젝트 결재</strong><small>상신·대기·완료 이력</small></span></Link></div>
    </ProjectWorkspaceShell>
  );
}

