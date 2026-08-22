import { availableNonConformanceList, unavailableNonConformanceList } from "@youone/ui/public";
import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { ncrCarQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function NonConformancesPage() {
  const result = await ncrCarQuery().listMineExternal();
  const view = result.availability === "AVAILABLE"
    ? availableNonConformanceList(result.items.map((ncr) => ({
        id: ncr.ncrId,
        ncrNo: ncr.ncrNo,
        severity: ncr.severity,
        state: ncr.state,
        contractId: ncr.contractId,
        ...(ncr.deliverableVersionId === undefined ? {} : { deliverableVersionId: ncr.deliverableVersionId }),
        ...(ncr.dueAt === undefined ? {} : { dueAt: ncr.dueAt })
      })))
    : unavailableNonConformanceList();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="ncr-title">
        <PageBackLink />
        <p className="eyebrow">NCR/CAR · SM-NCR-V1 · SM-CAR-V1</p>
        <h1 id="ncr-title">부적합 및 시정조치</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">
            로그인·Vendor Scope 조회 어댑터가 연결되기 전에는 부적합 건 수를 추정하지 않습니다. 외주 화면에는
            자신에게 할당된 containment와 CAR 수행정보만 표시하며 내부 책임검토, 계약 금액, 지급률과 결재정보는
            포함하지 않습니다.
          </p>
        ) : (
          <RecordGrid>
            {view.items.map((ncr) => (
              <RecordCard key={ncr.id} href={`/non-conformances/${ncr.id}`} eyebrow={`${ncr.ncrNo} · ${ncr.severity}`} title={ncr.ncrNo === "NCR-2026-014" ? "EMI 검증 증빙 누락" : "검사 지그 보정 라벨 오류"} meta={[`상태 ${ncr.state}`, ncr.dueAt ? `조치기한 ${ncr.dueAt}` : "기한 미지정"]} />
            ))}
          </RecordGrid>
        )}
      </section>
    </main>
  );
}
