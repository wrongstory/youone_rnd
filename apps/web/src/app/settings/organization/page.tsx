import { Buildings, IdentificationBadge, TreeStructure } from "@phosphor-icons/react/dist/ssr";

import { previewDataEnabled } from "../../../composition/preview-mode";
import { SecureActionPreview } from "../../../interface/app-overlays";
import { BackendContractNotice, EmptyOperationalState, OperationalPageHeader, OperationalStateBadge, SettingsSectionNavigation } from "../../../interface/operational-ui";
import { PreviewNotice } from "../../../interface/preview-ui";

export default function OrganizationSettingsPage() {
  const previewEnabled = previewDataEnabled();
  return (
    <main className="shell operationalShell">
      <OperationalPageHeader eyebrow="ORGANIZATION · POSITION" title="조직·부서·직책" description="표시명과 무관한 stable ID 및 유효기간형 사용자 배정을 조회합니다." />
      <SettingsSectionNavigation current="/settings/organization" /><PreviewNotice compact /><BackendContractNotice />
      {previewEnabled ? (
        <div className="operationalCardGrid"><section className="operationalPanel"><div className="panelIconHeading"><Buildings aria-hidden size={25} /><div><span>ORGANIZATION</span><h2>유원산업기술</h2></div><OperationalStateBadge tone="success">PREVIEW</OperationalStateBadge></div><ul className="hierarchyList"><li><TreeStructure aria-hidden size={20} /><div><strong>기업부설연구소</strong><span>DEPARTMENT_RND_LAB · preview 3명</span></div></li><li><TreeStructure aria-hidden size={20} /><div><strong>기술영업팀</strong><span>DEPARTMENT_TECH_SALES · preview</span></div></li></ul></section><section className="operationalPanel"><div className="panelIconHeading"><IdentificationBadge aria-hidden size={25} /><div><span>POSITION</span><h2>공식 직책</h2></div></div><ul className="dataList"><li><span>연구소장</span><strong>공식 승인권 가능</strong></li><li><span>대표</span><strong>정책별 공식 승인권</strong></li><li><span>선임연구원</span><strong>검토 역할 · 공식 승인권 아님</strong></li><li><span>연구원</span><strong>업무 수행</strong></li></ul><SecureActionPreview actionLabel="직책 배정 변경" subjectLabel="선택 사용자" /></section></div>
      ) : (
        <EmptyOperationalState title="조직·직책 Query 연결 대기" description="Backend #58의 실제 Organization·Department·Position projection이 없으면 조직 인원, 활성 상태, 사용자 배정을 추정하지 않습니다." />
      )}
    </main>
  );
}
