import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { purchaseQuery } from "../query";

export const dynamic = "force-dynamic";

const amount = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });

export default async function PurchaseDetailPage({
  params
}: {
  params: Promise<{ purchaseRequestId: string }>;
}) {
  const { purchaseRequestId } = await params;
  const result = await purchaseQuery().getMine(purchaseRequestId);
  const message = result.availability === "AVAILABLE"
    ? result.detail.requestNo
    : result.availability === "NOT_FOUND"
      ? "구매요청을 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 구매요청을 조회할 권한이 없습니다."
        : "구매 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="purchase-detail-title">
        <PageBackLink href="/purchases">구매·입고</PageBackLink>
        <p className="eyebrow">IMMUTABLE APPROVAL · RECEIPT · TYPED INSPECTION</p>
        <h1 id="purchase-detail-title">구매요청 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <FactGrid facts={[
              { label: "구매 목적", value: result.detail.purpose },
              { label: "진행 상태", value: result.detail.state },
              { label: "예상금액", value: amount.format(Number(result.detail.totalExpectedAmount.amount)) },
              { label: "선정 공급업체", value: result.detail.selectedSupplierName ?? "미선정" },
              { label: "외부 지급확인", value: result.detail.externalPaymentStatus === "CONFIRMED" ? "확인됨" : "미기록" },
              { label: "다음 작업", value: result.detail.nextAction ?? "대기" }
            ]} />

            <section className="detailSection" aria-labelledby="purchase-lines-title">
              <h2 id="purchase-lines-title">구매·입고 품목</h2>
              <ul className="timelineList">
                {result.detail.lines.map((line) => (
                  <li key={line.lineId}>
                    <strong>{line.itemCode} · {line.name}</strong>
                    <span>{line.specification}</span>
                    <span>입고 {line.receivedQuantity} / 요청 {line.quantity} {line.unitCode}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="detailSection" aria-labelledby="quotation-title">
              <h2 id="quotation-title">견적 비교 증빙</h2>
              <ul className="timelineList">
                {result.detail.quotationSummaries.map((quotation) => (
                  <li key={`${quotation.supplierName}-${quotation.quotedAmount.amount}`}>
                    <strong>{quotation.supplierName}</strong>
                    <span>{amount.format(Number(quotation.quotedAmount.amount))} · 증빙 {quotation.evidenceAvailable ? "확인 가능" : "미확인"}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="policyCallout warning">
              <strong>지급·결재 통제</strong>
              <p>구매결재는 정확한 불변 신청본에 묶입니다. 지급확인은 본사 외부시스템의 사실 기록이며 이 화면은 송금·회계 처리 명령을 제공하지 않습니다.</p>
            </div>
          </>
        ) : (
          <p className="summary">구매 권한, 현재 상태와 optimistic version을 한 transaction에서 재검증한 뒤에만 상세를 제공합니다.</p>
        )}
      </section>
    </main>
  );
}
