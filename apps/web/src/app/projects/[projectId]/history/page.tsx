import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";

import { ProjectWorkspaceShell, ProjectWorkspaceUnavailable } from "../../_components/project-workspace";
import { projectQuery } from "../../query";

export const dynamic = "force-dynamic";

export default async function ProjectHistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await projectQuery().getMine(projectId);
  if (result.availability !== "AVAILABLE") return <ProjectWorkspaceUnavailable />;
  const project = result.detail;
  return (
    <ProjectWorkspaceShell project={project} current="/history" title="변경 이력" description="상태 전이와 감사 이벤트를 수정 불가능한 시간순 projection으로 확인합니다.">
      <section className="operationalPanel"><div className="panelHeading"><div><span>STATE &amp; AUDIT TIMELINE</span><h2>프로젝트 이벤트</h2></div><ClockCounterClockwise aria-hidden size={24} /></div><ol className="operationalTimeline"><li><span /><div><strong>프로젝트 생성</strong><p>EVT-PROJECT-CREATE · version 1</p><time>2026-07-01 09:10</time></div></li><li><span /><div><strong>계획 상태 전환</strong><p>EVT-PROJECT-PLAN · optimistic version 확인</p><time>2026-07-03 14:20</time></div></li><li><span /><div><strong>WBS 진행 업데이트</strong><p>업무 상태·감사·outbox 원자 기록</p><time>2026-08-23 17:30</time></div></li></ol></section>
    </ProjectWorkspaceShell>
  );
}

