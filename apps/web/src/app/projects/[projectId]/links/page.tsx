import { Flask, LinkSimple, Package } from "@phosphor-icons/react/dist/ssr";

import { SecureActionPreview } from "../../../../interface/app-overlays";
import { EmptyOperationalState } from "../../../../interface/operational-ui";
import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../../_components/project-workspace";
import { projectQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function ProjectLinksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  return (
    <ProjectWorkspaceShell project={project} current="/links" title="제품·R&D 연결" description="Project와 Product, R&D Program의 N:M 관계를 명시적으로 관리합니다." actions={<SecureActionPreview actionLabel="제품 또는 R&D 과제 연결" subjectLabel={project.name} />}>
      <div className="operationalCardGrid"><section className="operationalPanel"><div className="panelIconHeading"><Package aria-hidden size={25} /><div><span>PRODUCT LINKS</span><h2>연결 제품</h2></div></div>{project.productLinks.length ? <ul className="dataList">{project.productLinks.map((link) => <li key={link.productId}><span>{link.relationType}</span><strong>{link.productId}</strong></li>)}</ul> : <EmptyOperationalState title="연결된 제품 없음" description="제품 연결 Command가 확정되면 이 영역에서 추가합니다." />}</section><section className="operationalPanel"><div className="panelIconHeading"><Flask aria-hidden size={25} /><div><span>R&amp;D PROGRAM LINKS</span><h2>연결 R&amp;D 과제</h2></div></div>{project.rndProgramLinks.length ? <ul className="dataList">{project.rndProgramLinks.map((link) => <li key={link.rndProgramId}><span>{link.relationType}</span><strong>{link.rndProgramId}</strong></li>)}</ul> : <EmptyOperationalState title="연결된 R&D 과제 없음" description="R&D 과제와 프로젝트를 같은 record로 합치지 않고 별도 관계로 연결합니다." />}</section></div><section className="operationalPanel policySummaryPanel"><LinkSimple aria-hidden size={24} /><div><h2>연결 원칙</h2><p>연결 해제는 원본 aggregate를 삭제하지 않으며, 승인·문서·외주 Scope가 참조하는 exact identity와 이력을 보존합니다.</p></div></section>
    </ProjectWorkspaceShell>
  );
}

