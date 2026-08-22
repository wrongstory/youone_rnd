import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { vendorContractQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const result = await vendorContractQuery().getBasicDetail(contractId);
  const message = result.availability === "AVAILABLE" ? `${result.detail.contractNo} · ${result.detail.vendorName}` : result.availability === "NOT_FOUND" ? "계약을 찾을 수 없습니다." : result.availability === "FORBIDDEN" ? "이 계약을 조회할 권한이 없습니다." : "계약 기본 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="contract-detail-title">
        <PageBackLink href="/contracts">외주 계약</PageBackLink>
        <p className="eyebrow">CONTRACT BASIC DETAIL · EXACT SCOPE</p>
        <h1 id="contract-detail-title">계약 기본 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <h2 className="detailTitle">{result.detail.title}</h2>
            <FactGrid facts={[
              { label: "계약 상태", value: result.detail.state },
              { label: "계약업체", value: result.detail.vendorName },
              { label: "계약기간", value: `${result.detail.effectiveFrom ?? "미정"} ~ ${result.detail.effectiveTo ?? "미정"}` },
              { label: "계약버전", value: result.detail.currentVersionNo ? `v${result.detail.currentVersionNo}` : "미확정" },
              { label: "납품항목", value: `${result.detail.deliverables.length}개` },
              { label: "마일스톤", value: `${result.detail.milestones.length}개` }
            ]} />
            <section className="detailSection" aria-labelledby="deliverables-title">
              <h2 id="deliverables-title">납품항목</h2>
              <ul className="timelineList">
                {result.detail.deliverables.map((deliverable) => <li key={deliverable.deliverableId}><strong>{deliverable.deliverableCode} · {deliverable.title}</strong><span>{deliverable.state}{deliverable.submittedVersionId ? ` · 제출본 ${deliverable.submittedVersionId}` : ""}</span></li>)}
              </ul>
            </section>
            <div className="policyCallout"><strong>외주 안전 조회</strong><p>이 화면에는 계약 금액·지급 조건·내부 업체평가를 포함하지 않습니다.</p></div>
          </>
        ) : (
          <p className="summary">계약 금액과 지급 조건은 별도 재무 권한 및 정확한 계약 Scope 검증을 통과한 전용 조회에서만 제공합니다.</p>
        )}
      </section>
    </main>
  );
}
