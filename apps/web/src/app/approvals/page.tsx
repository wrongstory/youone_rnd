import { approvalInboxAvailable, approvalInboxUnavailable, type ApprovalInboxViewModel } from "@youone/ui/public";

import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { approvalInboxQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const result = await approvalInboxQuery().listMine();
  const view: ApprovalInboxViewModel = result.availability === "UNAVAILABLE"
    ? approvalInboxUnavailable()
    : approvalInboxAvailable(result.items.map((item) => ({
        id: item.approvalInstanceId,
        subjectLabel: item.subjectKind,
        roleLabel: item.pendingRole,
        stateLabel: item.state,
        submitterLabel: item.submitterDisplayName,
        submittedAtLabel: item.submittedAt
      })));

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="approval-title">
        <PageBackLink />
        <p className="eyebrow">APPROVAL · SM-APPROVAL-V1</p>
        <h1 id="approval-title">내 결재함</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">조회 포트가 구성되기 전에는 결재 건수나 권한을 추정하지 않습니다. 서버·DB 권한 검사는 이후 실제 어댑터에서도 별도로 강제됩니다.</p>
        ) : (
          <RecordGrid>
            {view.items.map((item) => (
              <RecordCard
                key={item.id}
                href={`/approvals/${item.id}`}
                eyebrow={item.subjectLabel}
                title={item.subjectLabel === "RESEARCH_PROJECT_APPLICATION" ? "정식 연구과제 승격 신청" : "외주계약 변경본 결재"}
                meta={[`상태 ${item.stateLabel}`, `현재 단계 ${item.roleLabel}`, `기안자 ${item.submitterLabel}`, `상신 ${item.submittedAtLabel}`]}
              />
            ))}
          </RecordGrid>
        )}
      </section>
    </main>
  );
}
