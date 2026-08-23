import { ClipboardText } from "@phosphor-icons/react/dist/ssr";

import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../../interface/preview-ui";

const submittedApprovals = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    eyebrow: "정식 연구과제 신청",
    title: "고효율 배터리 냉각모듈 개발 과제 승격",
    meta: ["상태 IN_PROGRESS", "현재 결재자 박현우 연구소장", "상신 2026-08-20T01:20:00Z"]
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    eyebrow: "외주계약 변경",
    title: "냉각모듈 제어기 시제품 계약 변경본",
    meta: ["상태 SUBMITTED", "현재 단계 REVIEW", "상신 2026-08-21T05:10:00Z"]
  }
] as const;

export default function SubmittedApprovalsPage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="submitted-approval-title">
        <PageBackLink href="/approvals">내 결재함</PageBackLink>
        <p className="eyebrow">APPROVAL · SUBMITTED BY ME</p>
        <div className="pageTitleRow"><div><h1 id="submitted-approval-title">상신한 결재</h1><p>내가 기안하거나 상신한 결재의 현재 단계를 확인합니다.</p></div><ClipboardText aria-hidden size={36} weight="duotone" /></div>
        <PreviewNotice />
        <div className="filterBar" role="search">
          <label><span>기간</span><select defaultValue="90"><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="365">최근 1년</option></select></label>
          <label><span>상태</span><select defaultValue="all"><option value="all">전체 상태</option><option value="active">진행 중</option><option value="complete">완료</option></select></label>
        </div>
        <RecordGrid>
          {submittedApprovals.map((item) => <RecordCard key={item.id} href={`/approvals/${item.id}`} eyebrow={item.eyebrow} title={item.title} meta={item.meta} />)}
        </RecordGrid>
      </section>
    </main>
  );
}

