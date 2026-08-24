import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";

import { previewDataEnabled } from "../../../../composition/preview-mode";
import { EmptyOperationalState } from "../../../../interface/operational-ui";
import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../../_components/project-workspace";
import { projectQuery } from "../../query";

export const dynamic = "force-dynamic";

const previewEvents = [
  { title: "프로젝트 생성", detail: "EVT-PROJECT-CREATE · version 1", occurredAt: "2026-07-01 09:10" },
  { title: "계획 상태 전환", detail: "EVT-PROJECT-PLAN · optimistic version 확인", occurredAt: "2026-07-03 14:20" },
  { title: "WBS 진행 업데이트", detail: "업무 상태·감사·outbox 원자 기록", occurredAt: "2026-08-23 17:30" }
] as const;

export default async function ProjectHistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  const previewEnabled = previewDataEnabled();
  return (
    <ProjectWorkspaceShell project={project} current="/history" title="변경 이력" description="상태 전이와 감사 이벤트를 수정 불가능한 시간순 projection으로 확인합니다.">
      <section className="operationalPanel">
        <div className="panelHeading"><div><span>STATE &amp; AUDIT TIMELINE</span><h2>프로젝트 이벤트</h2></div><ClockCounterClockwise aria-hidden size={24} /></div>
        {previewEnabled ? (
          <ol className="operationalTimeline">{previewEvents.map((event) => <li key={`${event.title}-${event.occurredAt}`}><span /><div><strong>{event.title}</strong><p>{event.detail}</p><time>{event.occurredAt}</time></div></li>)}</ol>
        ) : (
          <EmptyOperationalState title="변경 이력 Query 연결 대기" description="Backend #58의 실제 상태·감사 projection이 없으면 이벤트 존재, 시각, 결과를 추정해 표시하지 않습니다." />
        )}
      </section>
    </ProjectWorkspaceShell>
  );
}
