import { UsersThree } from "@phosphor-icons/react/dist/ssr";

import { SecureActionPreview } from "../../../../interface/app-overlays";
import { OperationalStateBadge } from "../../../../interface/operational-ui";
import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../../_components/project-workspace";
import { projectQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function ProjectMembersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  return (
    <ProjectWorkspaceShell project={project} current="/members" title="프로젝트 구성원" description="구성원과 프로젝트 역할을 유효기간형 배정으로 관리합니다." actions={<SecureActionPreview actionLabel="프로젝트 구성원 추가" subjectLabel={project.name} />}>
      <section className="operationalPanel"><div className="panelHeading"><div><span>PROJECT MEMBERSHIP</span><h2>참여 구성원</h2></div><UsersThree aria-hidden size={24} /></div><ul className="memberManagementList">{project.members.map((member) => <li key={member.userId}><span className="memberAvatar" aria-hidden>{member.displayName.slice(0, 1)}</span><div><strong>{member.displayName}</strong><span>{member.projectRoleId}</span></div><OperationalStateBadge tone={member.state === "ACTIVE" ? "success" : "neutral"}>{member.state}</OperationalStateBadge><SecureActionPreview actionLabel="구성원 역할 또는 참여기간 변경" subjectLabel={member.displayName} /></li>)}</ul></section>
    </ProjectWorkspaceShell>
  );
}

