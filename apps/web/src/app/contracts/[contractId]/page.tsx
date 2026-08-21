import { vendorContractQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const result = await vendorContractQuery().getBasicDetail(contractId);
  const message = result.availability === "AVAILABLE"
    ? `${result.detail.contractNo} · ${result.detail.vendorName}`
    : result.availability === "NOT_FOUND"
      ? "계약을 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 계약을 조회할 권한이 없습니다."
        : "계약 기본 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="contract-detail-title">
        <p className="eyebrow">CONTRACT BASIC DETAIL · EXACT SCOPE</p>
        <h1 id="contract-detail-title">계약 기본 상세</h1>
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <p className="summary">
            {result.detail.state} · 납품항목 {result.detail.deliverables.length}개 · 마일스톤 {result.detail.milestones.length}개
          </p>
        ) : (
          <p className="summary">
            이 화면은 계약 범위와 납품항목 같은 기본 정보만 다룹니다. 계약 금액과 지급 조건은 별도 재무 권한 및
            정확한 계약 Scope 검증을 통과한 전용 조회에서만 제공하며, 명령 어댑터가 연결되기 전에는 변경 버튼을
            제공하지 않습니다.
          </p>
        )}
      </section>
    </main>
  );
}
