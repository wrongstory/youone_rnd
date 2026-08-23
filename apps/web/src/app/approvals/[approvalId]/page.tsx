import { uuid } from "@youone/shared-kernel/public";
import { approvalActionDisabled } from "@youone/ui/public";

import { SecureActionPreview } from "../../../interface/app-overlays";
import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { approvalInboxQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ approvalId: string }> }) {
  let id;
  try {
    id = uuid((await params).approvalId);
  } catch {
    return <main className="shell"><section className="hero"><PageBackLink href="/approvals">결재함</PageBackLink><h1>잘못된 결재 식별자</h1></section></main>;
  }

  const result = await approvalInboxQuery().getMine(id);
  if (result.availability === "UNAVAILABLE") {
    return <main className="shell"><section className="hero"><PageBackLink href="/approvals">결재함</PageBackLink><h1>결재 상세</h1><div className="status" role="status">조회 서비스 연결 전</div><p className="summary">빈 결재로 간주하지 않으며 어떤 결재 동작도 제공하지 않습니다.</p></section></main>;
  }

  const detail = result.detail;
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="approval-detail-title">
        <PageBackLink href="/approvals">결재함</PageBackLink>
        <p className="eyebrow">GENERATION {detail.generation} · {detail.state}</p>
        <h1 id="approval-detail-title">결재 상세</h1>
        <PreviewNotice />
        <FactGrid facts={[
          { label: "결재 대상", value: detail.subjectKind },
          { label: "대상 버전", value: `v${detail.subjectVersion}` },
          { label: "현재 상태", value: detail.state },
          { label: "결재 세대", value: detail.generation }
        ]} />

        <section className="detailSection" aria-labelledby="approval-line-title">
          <h2 id="approval-line-title">봉인 결재선</h2>
          <ol className="timelineList">
            {detail.sealedLine.map((step) => (
              <li key={step.stepId}>
                <strong>{step.role}</strong> · {step.completionMode} · {step.required ? "필수" : "선택"}
                <span>{step.participants.map((participant) => `${participant.displayName} (${participant.positionId})`).join(", ")}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="detailSection" aria-labelledby="approval-timeline-title">
          <h2 id="approval-timeline-title">변경 불가 타임라인</h2>
          <ol className="timelineList">
            {detail.timeline.map((action) => <li key={action.actionId}><strong>{action.kind}</strong><span>{action.actorDisplayName} · <time>{action.at}</time></span></li>)}
          </ol>
        </section>

        <section className="detailSection" aria-labelledby="approval-actions-title">
          <h2 id="approval-actions-title">가능한 동작</h2>
          <div className="actionRow">
            {detail.actions.map((action) => (
              <div className="actionCluster" key={action.actionId}>
                <button
                  disabled={approvalActionDisabled({
                    id: action.actionId,
                    label: action.label,
                    authorized: action.authorized,
                    commandAvailable: action.commandAvailable,
                    decisionId: action.decisionId,
                    evaluatedAt: action.evaluatedAt,
                    evidenceIds: action.evidenceIds,
                    obligations: action.obligations,
                    denyReasonCode: action.denyReasonCode
                  })}
                  title={action.denyReasonCode ?? (!action.commandAvailable ? "COMMAND_ADAPTER_NOT_CONFIGURED" : undefined)}
                  data-decision-id={action.decisionId}
                >
                  {action.label}{action.denyReasonCode ? ` — ${action.denyReasonCode}` : !action.commandAvailable ? " — 데모에서 실행 불가" : ""}
                </button>
                <SecureActionPreview actionLabel={action.label} subjectLabel={detail.subjectKind} />
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
