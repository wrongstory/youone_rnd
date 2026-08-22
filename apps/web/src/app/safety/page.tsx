import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { safetyQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function SafetyDashboardPage() {
  const result = await safetyQuery().getInternalDashboard();
  const message = result.availability === "AVAILABLE" ? "안전담당·점검·교육·사고 현황입니다." : result.availability === "FORBIDDEN" ? "안전 기록을 조회할 권한이 없습니다." : "안전 조회 서비스가 연결되지 않았습니다. 기록이 없다는 뜻이 아닙니다.";
  return <main className="shell"><section className="hero" aria-labelledby="safety-title">
    <PageBackLink /><p className="eyebrow">SAFETY LIGHT · WEEKLY/MONTHLY · 48-HOUR INVESTIGATION</p><h1 id="safety-title">안전관리</h1><PreviewNotice />
    <div className="status" role="status" data-availability={result.availability}>{message}</div>
    {result.availability === "AVAILABLE" ? <>
      <section className="detailSection" aria-labelledby="assignment-title"><h2 id="assignment-title">안전담당 지정</h2><RecordGrid>{result.dashboard.assignments.map((assignment) => <RecordCard key={assignment.assignmentId} href="/safety" eyebrow={assignment.role === "SAFETY_MANAGER" ? "안전관리자" : "팀 안전담당"} title={assignment.assigneeDisplayName} meta={[assignment.scopeLabel, `${assignment.effectiveFrom}~${assignment.effectiveTo ?? "현재"}`]} />)}</RecordGrid></section>
      <section className="detailSection" aria-labelledby="inspection-title"><h2 id="inspection-title">주간·월간 점검</h2><RecordGrid>{result.dashboard.inspections.map((inspection) => <RecordCard key={inspection.inspectionId} href={`/safety/inspections/${inspection.inspectionId}`} eyebrow={`${inspection.inspectionNo} · ${inspection.cadence}`} title={inspection.areaLabel} meta={[inspection.state, inspection.assignedInspectorDisplayName, `미결 finding ${inspection.openFindingCount}`, inspection.stopWorkActive ? "작업중지 중" : "작업중지 없음"]} />)}</RecordGrid></section>
      <section className="detailSection" aria-labelledby="training-title"><h2 id="training-title">교육·출석·보충교육</h2><RecordGrid>{result.dashboard.trainings.map((training) => <RecordCard key={training.trainingId} href="/safety" eyebrow={training.scheduledAt} title={training.title} meta={[training.instructorDisplayName, `대상 ${training.attendeeCount}명`, `결석 ${training.absentCount}명`, `보충교육 ${training.makeUpRequiredCount}명`, `이수율 ${training.completionRate}%`]} />)}</RecordGrid></section>
      <section className="detailSection" aria-labelledby="incident-title"><h2 id="incident-title">사고·48시간 조사</h2><RecordGrid>{result.dashboard.incidents.map((incident) => <RecordCard key={incident.incidentId} href={`/safety/incidents/${incident.incidentId}`} eyebrow={`${incident.incidentNo} · ${incident.state}`} title={incident.title} meta={[incident.areaLabel, incident.occurredAt, `조사기한 ${incident.investigationDueAt}`, incident.investigationSla]} />)}</RecordGrid></section>
    </> : <p className="summary">서버의 신뢰 ActorContext와 scope 판정 후에만 표시합니다. UI 숨김은 권한이 아닙니다.</p>}
  </section></main>;
}
