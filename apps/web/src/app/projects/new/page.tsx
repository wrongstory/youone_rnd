import { FolderPlus } from "@phosphor-icons/react/dist/ssr";

import { ProjectCreatePreviewForm } from "../../../interface/operational-forms";
import { BackendContractNotice, OperationalPageHeader } from "../../../interface/operational-ui";
import { PageBackLink, PreviewNotice } from "../../../interface/preview-ui";

export default function NewProjectPage() {
  return (
    <main className="shell operationalShell">
      <PageBackLink href="/projects">프로젝트</PageBackLink>
      <OperationalPageHeader eyebrow="PROJECT_CREATE · EVT-PROJECT-CREATE" title="새 프로젝트" description="모든 활성 내부 사용자는 일반 프로젝트를 생성할 수 있습니다." actions={<span className="headerIconPlate"><FolderPlus aria-hidden size={28} /></span>} />
      <PreviewNotice compact />
      <BackendContractNotice>프로젝트 코드는 Backend #58의 중복 방지 정책에 따라 확정하며, 생성자는 request body가 아니라 trusted actor에서 파생합니다.</BackendContractNotice>
      <ProjectCreatePreviewForm />
    </main>
  );
}

