import type { ProjectDetailView } from "@youone/feature-project/public";
import Link from "next/link";
import type { ReactNode } from "react";

import { BackendContractNotice, OperationalPageHeader, ProjectWorkspaceNavigation } from "../../../interface/operational-ui";
import { PageBackLink, PreviewNotice } from "../../../interface/preview-ui";

export function ProjectWorkspaceShell({
  project,
  current,
  title,
  description,
  actions,
  children
}: {
  project: ProjectDetailView;
  current: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="shell operationalShell projectWorkspaceShell">
      <PageBackLink href="/projects">프로젝트</PageBackLink>
      <OperationalPageHeader eyebrow={`${project.projectCode} · PROJECT WORKSPACE`} title={title} description={description} actions={actions} />
      <div className="workspaceIdentityBar"><div><strong>{project.name}</strong><span>{project.formalResearch ? "정식 연구과제" : "일반 프로젝트"} · {project.state}</span></div><Link href={`/projects/${project.projectId}`}>프로젝트 개요</Link></div>
      <ProjectWorkspaceNavigation projectId={project.projectId} current={current} />
      <PreviewNotice compact />
      <BackendContractNotice />
      {children}
    </main>
  );
}

export function ProjectWorkspaceUnavailable() {
  return (
    <main className="shell operationalShell">
      <PageBackLink href="/projects">프로젝트</PageBackLink>
      <OperationalPageHeader eyebrow="PROJECT WORKSPACE" title="프로젝트 작업공간" description="실제 Project Query와 현재 ActorContext 연결을 기다리고 있습니다." />
      <BackendContractNotice>가짜 구성원·WBS·정식 연구과제 상태를 만들지 않습니다.</BackendContractNotice>
    </main>
  );
}

