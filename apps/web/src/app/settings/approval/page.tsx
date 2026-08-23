import { GearSix, LockKey, Stamp } from "@phosphor-icons/react/dist/ssr";

import { PageBackLink, PreviewNotice } from "../../../interface/preview-ui";

const approvalPolicies = [
  { subject: "정식 연구과제 승격", line: "연구소장 검토·동의", scope: "모든 일반 프로젝트", version: "v1.0", state: "게시됨" },
  { subject: "L3 기술자료 외부 제공", line: "연구소장 승인", scope: "L3 통제사본", version: "v1.2", state: "게시됨" },
  { subject: "L4 기술자료 외부 제공", line: "연구소장 → 대표자 2명 중 1명", scope: "L4 통제사본", version: "v1.2", state: "게시됨" },
  { subject: "조건부·부분합격 지급률", line: "검수평가 → 지급률 조정 승인", scope: "외주 검수", version: "v1.0", state: "게시됨" }
] as const;

export default function ApprovalSettingsPage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="approval-settings-title">
        <PageBackLink href="/approvals">결재</PageBackLink>
        <p className="eyebrow">APPROVAL POLICY · VERSIONED</p>
        <div className="pageTitleRow"><div><h1 id="approval-settings-title">결재 설정</h1><p>게시된 결재선과 적용 범위를 조회합니다.</p></div><GearSix aria-hidden size={36} weight="duotone" /></div>
        <PreviewNotice />
        <aside className="policyCallout"><LockKey aria-hidden size={20} weight="bold" /><div><strong>버전형 정책만 사용합니다.</strong><p>게시된 결재정책은 덮어쓰지 않습니다. 변경은 새 초안·별도 승인·게시 이력을 남기며, 실제 편집은 운영 권한과 Command Adapter가 결합된 뒤 열립니다.</p></div></aside>
        <div className="tableScroller">
          <table className="enterpriseTable">
            <thead><tr><th>결재 대상</th><th>결재선</th><th>적용 범위</th><th>버전</th><th>상태</th></tr></thead>
            <tbody>{approvalPolicies.map((policy) => <tr key={policy.subject}><td><Stamp aria-hidden size={17} />{policy.subject}</td><td>{policy.line}</td><td>{policy.scope}</td><td>{policy.version}</td><td><span className="tableStatus">{policy.state}</span></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

