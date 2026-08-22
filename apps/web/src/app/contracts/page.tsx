import { availableContractList, unavailableContractList } from "@youone/ui/public";
import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { vendorContractQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const result = await vendorContractQuery().listSafe();
  const view = result.availability === "AVAILABLE"
    ? availableContractList(result.items.map((contract) => ({
        id: contract.contractId,
        contractNo: contract.contractNo,
        vendorName: contract.vendorName,
        state: contract.state,
        projectCount: contract.projectIds.length,
        currentVersionNo: contract.currentVersionNo
      })))
    : unavailableContractList();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="contracts-title">
        <PageBackLink />
        <p className="eyebrow">VENDOR CONTRACT · SM-VENDOR-CONTRACT-V1</p>
        <h1 id="contracts-title">외주 계약</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">
            조회 포트가 구성되기 전에는 계약 수나 상태를 추정하지 않습니다. 계약 금액·지급 조건·업체 내부평가는
            이 목록 응답에 포함되지 않으며, 업체 사용자는 활성 멤버십과 정확한 프로젝트·계약 Scope가 모두 확인된
            계약만 조회할 수 있습니다.
          </p>
        ) : (
          <RecordGrid>
            {view.items.map((contract) => (
              <RecordCard key={contract.id} href={`/contracts/${contract.id}`} eyebrow={`${contract.contractNo} · ${contract.vendorName}`} title={contract.contractNo === "CT-2026-018" ? "냉각모듈 제어기 시제품 제작" : "센서 검사 지그 제작"} meta={[`상태 ${contract.state}`, `연결 프로젝트 ${contract.projectCount}개`, contract.currentVersionNo === undefined ? "계약버전 미확정" : `계약 v${contract.currentVersionNo}`]} />
            ))}
          </RecordGrid>
        )}
      </section>
    </main>
  );
}
