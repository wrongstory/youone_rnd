import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";

import { previewAuditEvents } from "../../../composition/operational-preview-data";
import { previewDataEnabled } from "../../../composition/preview-mode";
import { BackendContractNotice, EmptyOperationalState, OperationalPageHeader, OperationalStateBadge, SettingsSectionNavigation } from "../../../interface/operational-ui";
import { PreviewNotice } from "../../../interface/preview-ui";

export const dynamic = "force-dynamic";

export default function AuditLogPage() {
  const events = previewDataEnabled() ? previewAuditEvents : [];
  return (
    <main className="shell operationalShell">
      <OperationalPageHeader eyebrow="APPEND-ONLY AUDIT" title="감사 로그" description="권한 변경·세션 회수·민감 조회 거부 등 보안 이벤트의 마스킹된 projection을 조회합니다." />
      <SettingsSectionNavigation current="/settings/audit" /><PreviewNotice compact /><BackendContractNotice>토큰·쿠키·요청 body·Storage key·예외 원문은 감사 화면에 포함하지 않습니다.</BackendContractNotice>
      <section className="operationalPanel"><div className="panelHeading"><div><span>SECURITY EVENTS</span><h2>최근 이벤트</h2></div><ShieldCheck aria-hidden size={24} /></div>{events.length ? <div className="tableScroller"><table className="enterpriseTable operationalTable"><thead><tr><th>이벤트</th><th>동작</th><th>Actor</th><th>대상</th><th>시각</th><th>결과</th></tr></thead><tbody>{events.map((event) => <tr key={event.eventId}><td>{event.eventId}</td><td><code>{event.action}</code></td><td>{event.actor}</td><td>{event.subject}</td><td>{event.occurredAt}</td><td><OperationalStateBadge tone={event.result === "SUCCESS" ? "success" : "danger"}>{event.result}</OperationalStateBadge></td></tr>)}</tbody></table></div> : <EmptyOperationalState title="감사 Query 연결 대기" description="권한 없는 사용자에게 감사 이벤트 수나 존재 여부를 추정해 제공하지 않습니다." />}</section>
    </main>
  );
}

