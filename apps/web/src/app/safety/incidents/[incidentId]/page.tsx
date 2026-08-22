import { FactGrid, PageBackLink, PreviewNotice } from "../../../../interface/preview-ui";
import { safetyQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function SafetyIncidentPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  const result = await safetyQuery().getInternalIncident(incidentId);
  const message = result.availability === "AVAILABLE" ? result.detail.incidentNo : result.availability === "NOT_FOUND" ? "사고 기록을 찾을 수 없습니다." : result.availability === "FORBIDDEN" ? "사고 기록을 조회할 권한이 없습니다." : "사고 조회 서비스 연결 전";
  return <main className="shell"><section className="hero" aria-labelledby="safety-incident-title"><PageBackLink href="/safety">안전관리</PageBackLink><p className="eyebrow">EMERGENCY · SITE PRESERVATION · INVESTIGATION · RECURRENCE</p><h1 id="safety-incident-title">안전사고 상세</h1><PreviewNotice /><div className="status" role="status" data-availability={result.availability}>{message}</div>
    {result.availability === "AVAILABLE" ? <><FactGrid facts={[{ label: "사고", value: result.detail.title }, { label: "상태", value: result.detail.state }, { label: "발생", value: result.detail.occurredAt }, { label: "구역", value: result.detail.areaLabel }, { label: "현장보존", value: result.detail.sitePreservationStatus }, { label: "48시간 조사기한", value: `${result.detail.investigationDueAt} · ${result.detail.investigationSla}` }]} />
      <section className="detailSection"><h2>응급대응·현장보존</h2><div className="policyCallout"><strong>{result.detail.reporterDisplayName} 보고</strong><p>{result.detail.emergencyResponseSummary}<br />현장보존: {result.detail.sitePreservationStatus}</p></div></section>
      <section className="detailSection"><h2>조사·재발방지</h2><p className="summary">조사 시작 {result.detail.investigationStartedAt ?? "대기"}</p><div className="policyCallout"><strong>내부 원인분석</strong><p>{result.detail.internalCauseAnalysis}</p></div><ol className="timelineList">{result.detail.recurrenceTasks.map((task) => <li key={task.taskId}><strong>{task.title}</strong><span>{task.responsibleDisplayName} · 기한 {task.dueAt}</span><span>{task.state} · 증빙 {task.evidenceStatus}</span></li>)}</ol><p className="summary">{result.detail.verificationSummary ?? "재발방지 효과 검증 대기"} · 보호 증빙 {result.detail.protectedEvidenceCount}건</p></section>
      <section className="detailSection"><h2>보존 이력</h2><ol className="timelineList">{result.detail.timeline.map((event) => <li key={`${event.eventId}-${event.occurredAt}`}><strong>{event.label}</strong><span>{event.eventId} · {event.occurredAt}</span></li>)}</ol></section>
    </> : <p className="summary">내부 조사 원인, 개인 교육 상세와 보안 원문은 외주 projection 및 Admin-System 자동권한에서 제외됩니다.</p>}</section></main>;
}
