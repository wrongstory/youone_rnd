import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { rndQuery } from "../query";

export const dynamic = "force-dynamic";

const amount = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });

export default async function RndProgramDetailPage({
  params
}: {
  params: Promise<{ rndProgramId: string }>;
}) {
  const { rndProgramId } = await params;
  const result = await rndQuery().getInternalSummary(rndProgramId);
  const message = result.availability === "AVAILABLE"
    ? result.summary.programCode
    : result.availability === "NOT_FOUND"
      ? "R&D 과제를 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 R&D 과제를 조회할 권한이 없습니다."
        : "R&D 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="rnd-detail-title">
        <PageBackLink href="/rnd-programs">R&amp;D 과제</PageBackLink>
        <p className="eyebrow">PROJECT N:M · IMMUTABLE BUDGET · EVIDENCE COMPLETENESS</p>
        <h1 id="rnd-detail-title">R&amp;D 과제 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <FactGrid facts={[
              { label: "과제명", value: result.summary.title },
              { label: "관리기관", value: result.summary.managingAgency },
              { label: "협약기간", value: `${result.summary.agreementFrom} ~ ${result.summary.agreementTo}` },
              { label: "연결 프로젝트", value: `${result.summary.projectIds.length}개` },
              { label: "현재 예산버전", value: result.summary.budget.currentBudgetVersionNo ? `v${result.summary.budget.currentBudgetVersionNo}` : "미등록" },
              { label: "집행률", value: `${result.summary.budget.executionRate}%` }
            ]} />

            <section className="detailSection" aria-labelledby="budget-title">
              <h2 id="budget-title">예산·집행 요약</h2>
              <FactGrid facts={[
                { label: "총 예산", value: amount.format(Number(result.summary.budget.totalBudget.amount)) },
                { label: "집행액", value: amount.format(Number(result.summary.budget.totalExpenditure.amount)) },
                { label: "잔액", value: amount.format(Number(result.summary.budget.balance.amount)) },
                { label: "증빙 완결", value: `${result.summary.evidence.expenditureWithEvidenceCount}/${result.summary.evidence.expenditureCount}건` }
              ]} />
              <ul className="timelineList">
                {result.summary.budget.categoryTotals.map((category) => (
                  <li key={category.categoryCode}>
                    <strong>{category.categoryCode}</strong>
                    <span>집행 {amount.format(Number(category.expenditureAmount))} / 예산 {amount.format(Number(category.budgetAmount))}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="detailSection" aria-labelledby="control-title">
              <h2 id="control-title">증빙·기한 통제</h2>
              <FactGrid facts={[
                { label: "증빙 누락", value: `${result.summary.evidence.missingEvidenceCount}건` },
                { label: "증빙 기한초과", value: `${result.summary.evidence.overdueEvidenceCount}건` },
                { label: "임박 기한", value: `${result.summary.deadlines.dueSoon}건` },
                { label: "기한초과", value: `${result.summary.deadlines.overdue}건` }
              ]} />
            </section>

            <div className="policyCallout warning">
              <strong>과제 상태 변경 비활성</strong>
              <p>정식 R&amp;D Program 상태머신은 OD-030 미확정입니다. 등록·예산·집행·증빙·기한은 기록하지만 시작·종료·정산·재개 명령은 임의 상태값 없이 차단합니다.</p>
            </div>
          </>
        ) : (
          <p className="summary">내부 사용자 권한과 과제 projection을 검증한 뒤에만 예산·집행·증빙정보를 제공합니다.</p>
        )}
      </section>
    </main>
  );
}
