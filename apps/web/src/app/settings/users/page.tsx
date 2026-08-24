import { UserPlus, UsersThree } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { previewOperationalUsers } from "../../../composition/operational-preview-data";
import { previewDataEnabled } from "../../../composition/preview-mode";
import { BackendContractNotice, EmptyOperationalState, OperationalPageHeader, OperationalStateBadge, SettingsSectionNavigation } from "../../../interface/operational-ui";
import { PreviewNotice } from "../../../interface/preview-ui";

export const dynamic = "force-dynamic";

export default function UserManagementPage() {
  const previewEnabled = previewDataEnabled();
  const users = previewEnabled ? previewOperationalUsers : [];
  return (
    <main className="shell operationalShell">
      <OperationalPageHeader eyebrow="SYSTEM MANAGEMENT · USER_ACCOUNT" title="사용자 관리" description="내부·외주 계정의 상태와 유효한 조직·직책·역할 배정을 관리합니다." actions={<button className="primaryActionButton" type="button" disabled><UserPlus aria-hidden size={18} />사용자 초대</button>} />
      <SettingsSectionNavigation current="/settings/users" />
      <PreviewNotice compact />
      <BackendContractNotice>초대·배정·비활성화는 Backend #58의 audited workflow 연결 후 실행됩니다.</BackendContractNotice>
      <section className="operationalPanel" aria-labelledby="user-list-title">
        <div className="panelHeading"><div><span>ACCOUNT DIRECTORY</span><h2 id="user-list-title">계정 현황</h2></div><strong>{users.length}명</strong></div>
        <div className="inlineOperationalToolbar"><label><span>계정 검색</span><input type="search" placeholder="이름·식별자" disabled={!previewEnabled} /></label><label><span>상태</span><select disabled={!previewEnabled}><option>전체 상태</option><option>활성</option><option>초대 대기</option><option>비활성</option></select></label><label><span>계정 종류</span><select disabled={!previewEnabled}><option>전체</option><option>내부 사용자</option><option>외주 사용자</option></select></label></div>
        {users.length ? <div className="tableScroller"><table className="enterpriseTable operationalTable"><thead><tr><th>사용자</th><th>계정 종류</th><th>조직·직책</th><th>역할</th><th>MFA</th><th>상태</th><th><span className="srOnly">상세</span></th></tr></thead><tbody>{users.map((user) => <tr key={user.userId}><td><UsersThree aria-hidden size={17} /><span><strong>{user.displayName}</strong><small>{user.identifier}</small></span></td><td>{user.accountKind === "INTERNAL" ? "내부" : "외주"}</td><td><span><strong>{user.department}</strong><small>{user.position}</small></span></td><td>{user.role}</td><td><OperationalStateBadge tone={user.mfaState === "AAL2" ? "success" : "warning"}>{user.mfaState}</OperationalStateBadge></td><td><OperationalStateBadge tone={user.status === "ACTIVE" ? "success" : "warning"}>{user.status}</OperationalStateBadge></td><td><Link className="tableDetailLink" href={`/settings/users/${user.userId}`}>상세</Link></td></tr>)}</tbody></table></div> : <EmptyOperationalState title="사용자 Query 연결 대기" description="운영 계정 수를 추정하지 않습니다. Backend #58이 UserAccount projection을 제공하면 표시합니다." />}
      </section>
    </main>
  );
}

