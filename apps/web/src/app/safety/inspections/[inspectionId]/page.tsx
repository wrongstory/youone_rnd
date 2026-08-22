import { FactGrid, PageBackLink, PreviewNotice } from "../../../../interface/preview-ui";
import { safetyQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function SafetyInspectionPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await params;
  const result = await safetyQuery().getInternalInspection(inspectionId);
  const message = result.availability === "AVAILABLE" ? result.detail.inspectionNo : result.availability === "NOT_FOUND" ? "점검을 찾을 수 없습니다." : result.availability === "FORBIDDEN" ? "점검을 조회할 권한이 없습니다." : "점검 조회 서비스 연결 전";
  return <main className="shell"><section className="hero" aria-labelledby="safety-inspection-title"><PageBackLink href="/safety">안전관리</PageBackLink><p className="eyebrow">FINDING · STOP-WORK · CORRECTION · VERIFICATION</p><h1 id="safety-inspection-title">안전점검 상세</h1><PreviewNotice /><div className="status" role="status" data-availability={result.availability}>{message}</div>
    {result.availability === "AVAILABLE" ? <><FactGrid facts={[{ label: "구역", value: result.detail.areaLabel }, { label: "주기", value: result.detail.cadence }, { label: "상태", value: result.detail.state }, { label: "담당", value: result.detail.assignedInspectorDisplayName }, { label: "체크리스트", value: result.detail.checklistTitle }, { label: "작업중지", value: result.detail.stopWorkActive ? "활성" : "없음" }]} />
      <section className="detailSection"><h2>Finding·작업중지</h2><ol className="timelineList">{result.detail.findings.map((finding) => <li key={finding.findingId}><strong>{finding.riskLevel} · {finding.criterionLabel}</strong><span>{finding.summary}</span><span>{finding.stopWorkRequired ? "즉시 작업중지 필요" : "시정조치 추적"} · {finding.issuedAt}</span></li>)}</ol></section>
      <section className="detailSection"><h2>시정조치·검증</h2><ol className="timelineList">{result.detail.tasks.map((task) => <li key={task.taskId}><strong>{task.title}</strong><span>{task.responsibleDisplayName} · {task.responsibleParty} · 기한 {task.dueAt}</span><span>{task.state} · 증빙 {task.evidenceStatus}</span></li>)}</ol>{result.detail.verifications.map((verification) => <div className="policyCallout" key={verification.verificationId}><strong>검증 {verification.outcome}</strong><p>{verification.verifierDisplayName} · {verification.verifiedAt} · 증빙 {verification.evidenceCount}건</p></div>)}</section>
      <section className="detailSection"><h2>상태 이력</h2><ol className="timelineList">{result.detail.timeline.map((event) => <li key={`${event.eventId}-${event.occurredAt}`}><strong>{event.label}</strong><span>{event.eventId} · {event.occurredAt}</span></li>)}</ol></section>
    </> : <p className="summary">점검 원문과 증적은 서버 필드 projection이 허용한 경우에만 제공됩니다.</p>}</section></main>;
}
