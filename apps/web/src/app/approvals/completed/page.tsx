import { CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../../interface/preview-ui";

const completedApprovals = [
  { id: "a0000000-0000-4000-8000-000000000001", eyebrow: "연구노트 확정", title: "배터리 열편차 2차 시험 연구노트", meta: ["상태 COMPLETED", "결과 승인", "완료 2026-08-24T00:42:00Z"] },
  { id: "a0000000-0000-4000-8000-000000000002", eyebrow: "구매요청", title: "열화상 카메라 구매요청", meta: ["상태 RETURNED", "결과 회송", "완료 2026-08-22T08:10:00Z"] }
] as const;

export default function CompletedApprovalsPage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="completed-approval-title">
        <PageBackLink href="/approvals">내 결재함</PageBackLink>
        <p className="eyebrow">APPROVAL · COMPLETED</p>
        <div className="pageTitleRow"><div><h1 id="completed-approval-title">완료된 결재</h1><p>승인·반려·회송된 결재의 봉인 이력을 조회합니다.</p></div><CheckCircle aria-hidden size={36} weight="duotone" /></div>
        <PreviewNotice />
        <div className="filterBar" role="search">
          <label><span>결과</span><select defaultValue="all"><option value="all">전체 결과</option><option value="approved">승인</option><option value="returned">회송·반려</option></select></label>
          <label><span>문서 유형</span><select defaultValue="all"><option value="all">전체 유형</option><option value="research-note">연구노트</option><option value="purchase">구매요청</option></select></label>
        </div>
        <RecordGrid>
          {completedApprovals.map((item) => <RecordCard key={item.title} href={`/approvals/${item.id}`} eyebrow={item.eyebrow} title={item.title} meta={item.meta} />)}
        </RecordGrid>
      </section>
    </main>
  );
}

