import { availableInspectionList, unavailableInspectionList } from "@youone/ui/public";
import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { inspectionQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  const result = await inspectionQuery().listMineExternal();
  const view = result.availability === "AVAILABLE"
    ? availableInspectionList(result.items.map((inspection) => ({
        id: inspection.inspectionId,
        inspectionNo: inspection.inspectionNo,
        inspectionTypeCode: inspection.inspectionTypeCode,
        state: inspection.state,
        contractId: inspection.contractId,
        deliverableVersionId: inspection.deliverableVersionId,
        ...(inspection.latestExternalDisposition === undefined
          ? {}
          : { latestExternalDisposition: inspection.latestExternalDisposition })
      })))
    : unavailableInspectionList();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="inspections-title">
        <PageBackLink />
        <p className="eyebrow">INSPECTION · SM-INSPECTION-V1</p>
        <h1 id="inspections-title">검수 현황</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">
            로그인·Scope 조회 어댑터가 연결되기 전에는 검수 건 수를 추정하지 않습니다. 외주업체에는 외부 판정과
            시정요청만 표시하며 내부 검토의견, 계약 금액, 지급률과 결재정보는 이 응답에 포함하지 않습니다.
          </p>
        ) : (
          <RecordGrid>
            {view.items.map((inspection) => (
              <RecordCard key={inspection.id} href={`/inspections/${inspection.id}`} eyebrow={`${inspection.inspectionNo} · ${inspection.inspectionTypeCode}`} title={inspection.inspectionNo === "INS-2026-032" ? "제어기 설계 패키지 검수" : "자동 검사 지그 수입검사"} meta={[`상태 ${inspection.state}`, `판정 ${inspection.latestExternalDisposition ?? "판정 전"}`]} />
            ))}
          </RecordGrid>
        )}
      </section>
    </main>
  );
}
