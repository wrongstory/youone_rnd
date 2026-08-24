import { FormalResearchApplicationPreviewForm } from "../../../../../interface/operational-forms";
import { BackendContractNotice, OperationalPageHeader } from "../../../../../interface/operational-ui";
import { PageBackLink, PreviewNotice } from "../../../../../interface/preview-ui";
import { projectQuery } from "../../../query";

export const dynamic = "force-dynamic";

export default async function NewFormalResearchApplicationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  const projectName = result.availability === "AVAILABLE" ? result.detail.name : "선택 프로젝트";
  return (
    <main className="shell operationalShell">
      <PageBackLink href={`/projects/${projectId}`}>프로젝트 작업공간</PageBackLink>
      <OperationalPageHeader eyebrow="RESEARCH_PROJECT_APPLICATION · IMMUTABLE VERSION" title="정식 연구과제 신청본" description="일반 프로젝트와 분리된 신청 버전을 작성하고 연구소장 검토·동의를 요청합니다." />
      <PreviewNotice compact /><BackendContractNotice />
      <FormalResearchApplicationPreviewForm projectName={projectName} />
    </main>
  );
}

