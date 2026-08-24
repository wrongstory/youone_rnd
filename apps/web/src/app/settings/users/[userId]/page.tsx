import { IdentificationCard, LockKey, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { notFound } from "next/navigation";

import { previewOperationalUsers } from "../../../../composition/operational-preview-data";
import { previewDataEnabled } from "../../../../composition/preview-mode";
import { BackendContractNotice, OperationalPageHeader, OperationalStateBadge, SettingsSectionNavigation } from "../../../../interface/operational-ui";
import { FactGrid, PageBackLink, PreviewNotice } from "../../../../interface/preview-ui";
import { SecureActionPreview } from "../../../../interface/app-overlays";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const user = previewDataEnabled() ? previewOperationalUsers.find((item) => item.userId === userId) : undefined;
  if (previewDataEnabled() && !user) notFound();
  return (
    <main className="shell operationalShell">
      <PageBackLink href="/settings/users">사용자 관리</PageBackLink>
      <OperationalPageHeader eyebrow="USER_ACCOUNT · EFFECTIVE ASSIGNMENT" title={user?.displayName ?? "사용자 상세"} description="provider 인증 주체와 분리된 내부 UserAccount 및 유효기간형 배정을 확인합니다." actions={user ? <SecureActionPreview actionLabel="계정 비활성화 및 세션 종료" subjectLabel={user.displayName} /> : undefined} />
      <SettingsSectionNavigation current="/settings/users" />
      <PreviewNotice compact />
      <BackendContractNotice />
      {user ? <><section className="operationalPanel"><div className="identitySummary"><UserCircle aria-hidden size={54} weight="fill" /><div><span>{user.accountKind}</span><h2>{user.displayName}</h2><p>{user.identifier}</p></div><OperationalStateBadge tone={user.status === "ACTIVE" ? "success" : "warning"}>{user.status}</OperationalStateBadge></div><FactGrid facts={[{ label: "UserAccount ID", value: user.userId }, { label: "조직", value: user.organization }, { label: "부서", value: user.department }, { label: "직책", value: user.position }, { label: "역할", value: user.role }, { label: "MFA", value: user.mfaState }]} /></section><div className="operationalCardGrid"><section className="operationalPanel"><div className="panelIconHeading"><IdentificationCard aria-hidden size={24} /><div><span>ASSIGNMENT</span><h2>유효 배정</h2></div></div><ul className="dataList"><li><span>조직·부서</span><strong>{user.organization} · {user.department}</strong></li><li><span>직책</span><strong>{user.position}</strong></li><li><span>역할</span><strong>{user.role}</strong></li></ul><SecureActionPreview actionLabel="유효 배정 변경" subjectLabel={user.displayName} /></section><section className="operationalPanel"><div className="panelIconHeading"><LockKey aria-hidden size={24} /><div><span>SESSION SECURITY</span><h2>인증·세션</h2></div></div><ul className="dataList"><li><span>보증 수준</span><strong>{user.mfaState}</strong></li><li><span>single-session</span><strong>정책 적용 대상</strong></li><li><span>민감 작업</span><strong>step-up 필요</strong></li></ul><SecureActionPreview actionLabel="전역 세션 종료" subjectLabel={user.displayName} /></section></div></> : <section className="operationalPanel"><p>Backend #58 UserAccount detail Query 연결 대기</p></section>}
    </main>
  );
}

