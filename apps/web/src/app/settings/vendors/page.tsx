import { Buildings, ShieldCheck, UsersThree } from "@phosphor-icons/react/dist/ssr";

import { previewVendorAccounts } from "../../../composition/operational-preview-data";
import { previewDataEnabled } from "../../../composition/preview-mode";
import { SecureActionPreview } from "../../../interface/app-overlays";
import { BackendContractNotice, EmptyOperationalState, OperationalPageHeader, OperationalStateBadge, SettingsSectionNavigation } from "../../../interface/operational-ui";
import { PreviewNotice } from "../../../interface/preview-ui";

export const dynamic = "force-dynamic";

export default function VendorAccountManagementPage() {
  const vendors = previewDataEnabled() ? previewVendorAccounts : [];
  return (
    <main className="shell operationalShell">
      <OperationalPageHeader eyebrow="SYSTEM MANAGEMENT · VENDOR" title="외주 계정 관리" description="외주업체 membership과 exact Project·Contract grant의 교집합을 관리합니다." />
      <SettingsSectionNavigation current="/settings/vendors" /><PreviewNotice compact />
      <BackendContractNotice>Project grant만 있거나 Contract가 없는 대상은 외주 projection을 제공하지 않습니다.</BackendContractNotice>
      {vendors.length ? <div className="operationalCardGrid">{vendors.map((vendor) => <section className="operationalPanel vendorAccountCard" key={vendor.vendorId}><div className="panelIconHeading"><Buildings aria-hidden size={26} /><div><span>VENDOR ACCOUNT</span><h2>{vendor.vendorName}</h2></div><OperationalStateBadge tone={vendor.status === "ACTIVE" ? "success" : "warning"}>{vendor.status}</OperationalStateBadge></div><ul className="dataList"><li><span><UsersThree aria-hidden size={16} />활성 사용자</span><strong>{vendor.userCount}명</strong></li><li><span>Project grant</span><strong>{vendor.activeProjectGrants}건</strong></li><li><span>Contract grant</span><strong>{vendor.activeContractGrants}건</strong></li><li><span>계정 유효기간</span><strong>{vendor.validUntil}</strong></li></ul><div className="cardPolicy"><ShieldCheck aria-hidden size={18} /><span>Vendor Deny by Default · 금액/지급/내부평가 비노출</span></div><SecureActionPreview actionLabel="외주 Scope 배정 검토" subjectLabel={vendor.vendorName} /></section>)}</div> : <EmptyOperationalState title="외주 계정 Query 연결 대기" description="실제 VendorMembership과 Project·Contract grant가 준비되기 전에는 접근 가능 범위를 추정하지 않습니다." />}
    </main>
  );
}

