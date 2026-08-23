import { ArrowRight, CheckCircle, Clock, FileText, FolderOpen, Stamp, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { previewApprovalInbox, previewProjects } from "../composition/preview-data";
import { previewDataEnabled } from "../composition/preview-mode";
import { ConnectivityStatus } from "../interface/connectivity-status";
import { formatSeoulDate } from "../interface/display-format";
import { PreviewNotice } from "../interface/preview-ui";

const dashboardMetrics = [
  { label: "결재 대기", value: 2, unit: "건", tone: "danger", icon: Stamp, href: "/approvals" },
  { label: "작성 중 문서", value: 1, unit: "건", tone: "neutral", icon: FileText, href: "/documents" },
  { label: "기한 초과", value: 0, unit: "건", tone: "success", icon: WarningCircle, href: "/projects" },
  { label: "오늘 할 일", value: 5, unit: "건", tone: "primary", icon: CheckCircle, href: "/projects" }
] as const;

export const dynamic = "force-dynamic";

export default function HomePage() {
  const previewEnabled = previewDataEnabled();
  const today = formatSeoulDate(new Date());

  return (
    <main className="dashboardPage">
      <header className="dashboardHeading">
        <div>
          <h1>업무 대시보드</h1>
          <div className="dashboardGreeting"><p>{previewEnabled ? "안녕하세요, 박현우 연구소장님" : "사용자 정보 연결 대기"}</p><time>{today}</time></div>
        </div>
      </header>

      <div className="dashboardStatusRow">
        <ConnectivityStatus />
        <div className="dashboardPreviewNotice"><PreviewNotice compact /></div>
      </div>

      <section className="dashboardSection" aria-labelledby="today-work-title">
        <div className="sectionHeading">
          <div><span>내 업무</span><h2 id="today-work-title">오늘 처리할 업무</h2></div>
          <Link href="/approvals">전체 보기 <ArrowRight aria-hidden size={16} /></Link>
        </div>
        <div className="metricGrid">
          {dashboardMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Link className={`metricCard metric-${metric.tone}`} href={metric.href} key={metric.label}>
                <span className="metricIcon"><Icon aria-hidden size={21} weight="bold" /></span>
                <span className="metricLabel">{metric.label}</span>
                <strong>{previewEnabled ? metric.value : "–"}<small>{metric.unit}</small></strong>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="dashboardColumns">
        <section className="dashboardSection approvalPanel" aria-labelledby="pending-approval-title">
          <div className="sectionHeading">
            <div><span>결재</span><h2 id="pending-approval-title">결재 대기 목록</h2></div>
            <Link href="/approvals">전체 보기 <ArrowRight aria-hidden size={16} /></Link>
          </div>
          {previewEnabled ? (
            <ul className="compactWorkList">
              {previewApprovalInbox.map((approval, index) => (
                <li key={approval.approvalInstanceId}>
                  <Link href={`/approvals/${approval.approvalInstanceId}`}>
                    <span className={index === 0 ? "workTypeBadge isUrgent" : "workTypeBadge"}>{index === 0 ? "연구과제" : "계약"}</span>
                    <span className="workSummary">
                      <strong>{approval.subjectKind === "RESEARCH_PROJECT_APPLICATION" ? "고효율 배터리 냉각모듈 정식 연구과제 승격" : "냉각모듈 제어기 시제품 계약 변경"}</strong>
                      <small>{approval.submitterDisplayName} · {index === 0 ? "오늘 10:20" : "어제 14:10"}</small>
                    </span>
                    <CaretStatus label={index === 0 ? "검토 필요" : "검토"} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <UnavailableDashboardState />}
        </section>

        <section className="dashboardSection projectPanel" aria-labelledby="project-progress-title">
          <div className="sectionHeading">
            <div><span>프로젝트</span><h2 id="project-progress-title">프로젝트 진행 현황</h2></div>
            <Link href="/projects">전체 보기 <ArrowRight aria-hidden size={16} /></Link>
          </div>
          {previewEnabled ? (
            <ul className="projectProgressList">
              {previewProjects.map((project, index) => {
                const progress = index === 0 ? 65 : 10;
                return (
                  <li key={project.projectId}>
                    <Link href={`/projects/${project.projectId}`}>
                      <span className="projectIcon"><FolderOpen aria-hidden size={22} weight="fill" /></span>
                      <span className="projectSummary">
                        <strong>{project.name}</strong>
                        <small>{project.projectCode} · {project.formalResearch ? "정식 연구과제" : "일반 프로젝트"}</small>
                        <span className="dashboardProgress" aria-label={`진행률 ${progress}%`}><i style={{ width: `${progress}%` }} /></span>
                      </span>
                      <b>{progress}%</b>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <UnavailableDashboardState />}
        </section>
      </div>

      <section className="dashboardSection recentPanel" aria-labelledby="recent-update-title">
        <div className="sectionHeading">
          <div><span>업데이트</span><h2 id="recent-update-title">최근 업데이트</h2></div>
          <Link href="/notifications">전체 보기 <ArrowRight aria-hidden size={16} /></Link>
        </div>
        <ul className="recentUpdateList">
          <li><CheckCircle aria-hidden size={20} weight="fill" /><span><strong>연구노트 RN-2026-0821이 연구소장 확정되었습니다.</strong><small>오늘 09:42 · 연구노트</small></span></li>
          <li><Clock aria-hidden size={20} weight="fill" /><span><strong>냉각채널 가공 과업이 검토 대기 상태입니다.</strong><small>어제 17:30 · 프로젝트</small></span></li>
          <li><WarningCircle aria-hidden size={20} weight="fill" /><span><strong>통제사본 1건의 회수 예정일이 임박했습니다.</strong><small>어제 15:10 · 기술자료</small></span></li>
        </ul>
      </section>
    </main>
  );
}

function CaretStatus({ label }: { label: string }) {
  return <span className="workStatus">{label}<ArrowRight aria-hidden size={15} /></span>;
}

function UnavailableDashboardState() {
  return (
    <div className="dashboardUnavailable">
      <WarningCircle aria-hidden size={22} />
      <span><strong>업무 데이터 연결 대기</strong><small>실제 조회 어댑터가 준비되기 전에는 건수를 추정하지 않습니다.</small></span>
    </div>
  );
}
