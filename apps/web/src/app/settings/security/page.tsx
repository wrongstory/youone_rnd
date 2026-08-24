import { Clock, DeviceMobile, LockKey, SignOut } from "@phosphor-icons/react/dist/ssr";

import { SecureActionPreview } from "../../../interface/app-overlays";
import { BackendContractNotice, OperationalPageHeader, OperationalStateBadge, SettingsSectionNavigation } from "../../../interface/operational-ui";
import { PreviewNotice } from "../../../interface/preview-ui";

export default function SessionSecurityPage() {
  return (
    <main className="shell operationalShell">
      <OperationalPageHeader eyebrow="OD-019 · OD-036" title="세션·MFA 보안" description="현재 승인된 인증 강도와 세션 정책을 확인하고 민감 조치를 수행합니다." />
      <SettingsSectionNavigation current="/settings/security" /><PreviewNotice compact /><BackendContractNotice />
      <div className="securityMetricGrid"><article><LockKey aria-hidden size={24} /><span>MFA</span><strong>TOTP AAL2</strong><OperationalStateBadge tone="success">필수</OperationalStateBadge></article><article><Clock aria-hidden size={24} /><span>JWT / inactivity</span><strong>60분 / 60분</strong><OperationalStateBadge>정책 v1</OperationalStateBadge></article><article><DeviceMobile aria-hidden size={24} /><span>Session / device</span><strong>480분 · single</strong><OperationalStateBadge tone="warning">재인증</OperationalStateBadge></article></div>
      <section className="operationalPanel"><div className="panelHeading"><div><span>ACTIVE SESSION</span><h2>현재 세션</h2></div><OperationalStateBadge tone="success">AAL2</OperationalStateBadge></div><ul className="dataList"><li><span>기기</span><strong>현재 브라우저 · 화면 검토</strong></li><li><span>활성 session 확인</span><strong>Backend #58 연결 대기</strong></li><li><span>민감 action</span><strong>step-up 필요</strong></li><li><span>잔여 access token 위험</span><strong>최대 60분 · 요청별 sessions 검사</strong></li></ul><SecureActionPreview actionLabel="전역 로그아웃" subjectLabel="현재 UserAccount의 모든 세션" /></section>
      <section className="operationalPanel dangerZone"><SignOut aria-hidden size={24} /><div><h2>계정 비활성화와 세션 회수</h2><p>provider 호출 전후 감사, retry 3회, reconciliation 15분을 적용하고 실제 session 제거가 확인되지 않으면 완료로 표시하지 않습니다.</p></div></section>
    </main>
  );
}

