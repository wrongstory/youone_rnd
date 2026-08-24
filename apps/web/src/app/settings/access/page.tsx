import { Key, LockKeyOpen, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

import { previewDataEnabled } from "../../../composition/preview-mode";
import { BackendContractNotice, EmptyOperationalState, OperationalPageHeader, OperationalStateBadge, SettingsSectionNavigation } from "../../../interface/operational-ui";
import { PreviewNotice } from "../../../interface/preview-ui";

const previewRoles = [
  { id: "ROLE_LAB_DIRECTOR", label: "연구소장", scope: "연구소·배정 Project" },
  { id: "ROLE_RESEARCHER", label: "연구원", scope: "배정 Project" },
  { id: "ROLE_ADMIN_SYSTEM", label: "시스템 관리자", scope: "운영 metadata" },
  { id: "ROLE_VENDOR_USER", label: "외주 사용자", scope: "exact Vendor+Project+Contract" }
] as const;

export default function AccessSettingsPage() {
  const roles = previewDataEnabled() ? previewRoles : [];
  return (
    <main className="shell operationalShell">
      <OperationalPageHeader eyebrow="RBAC · SCOPE · PROJECTION" title="역할·권한 배정 현황" description="승인된 stable Role/Permission을 조회하고 사용자별 유효 배정을 관리합니다." />
      <SettingsSectionNavigation current="/settings/access" /><PreviewNotice compact /><BackendContractNotice>범용 역할 편집기는 제공하지 않습니다. 역할 정의 변경은 별도 정책·승인 Gate 대상입니다.</BackendContractNotice>
      <section className="operationalPanel"><div className="panelHeading"><div><span>STABLE ROLE REGISTRY</span><h2>역할 카탈로그</h2></div><Key aria-hidden size={24} /></div>{roles.length ? <div className="roleCardGrid">{roles.map((role) => <article key={role.id}><div><LockKeyOpen aria-hidden size={21} /><OperationalStateBadge>PREVIEW</OperationalStateBadge></div><h3>{role.label}</h3><code>{role.id}</code><p>{role.scope}</p></article>)}</div> : <EmptyOperationalState title="역할·권한 Query 연결 대기" description="Backend #58의 실제 Role/Permission registry와 사용자별 effective assignment가 없으면 활성 여부와 배정 현황을 추정하지 않습니다." />}</section>
      <section className="operationalPanel policySummaryPanel"><ShieldCheck aria-hidden size={25} /><div><h2>권한 경계</h2><p>Admin-System은 L3/L4 원문 자동 열람권을 얻지 않으며, 외주 사용자는 활성 VendorMembership과 exact Project·Contract grant를 모두 만족해야 합니다.</p></div></section>
    </main>
  );
}
