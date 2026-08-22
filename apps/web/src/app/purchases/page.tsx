import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { purchaseQuery } from "./query";

export const dynamic = "force-dynamic";

const amount = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });

export default async function PurchasesPage() {
  const result = await purchaseQuery().listMine();
  const message = result.availability === "AVAILABLE"
    ? result.items.length ? "조회할 수 있는 구매요청이 있습니다." : "현재 조회할 수 있는 구매요청이 없습니다."
    : result.availability === "FORBIDDEN"
      ? "구매정보를 조회할 권한이 없습니다."
      : "구매 조회 서비스가 아직 연결되지 않았습니다. 구매 건이 없다는 뜻이 아닙니다.";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="purchase-title">
        <PageBackLink />
        <p className="eyebrow">구매 · SM-PURCHASE-V1 · EXACT REQUEST VERSION</p>
        <h1 id="purchase-title">구매·입고·검수 현황</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <RecordGrid>
            {result.items.map((purchase) => (
              <RecordCard
                key={purchase.purchaseRequestId}
                href={`/purchases/${purchase.purchaseRequestId}`}
                eyebrow={`${purchase.requestNo} · ${purchase.state}`}
                title={purchase.purpose}
                meta={[
                  amount.format(Number(purchase.totalExpectedAmount.amount)),
                  `입고 ${purchase.receivedLineCount}/${purchase.totalLineCount}개 품목`,
                  `검수 ${purchase.inspectionStatus}`
                ]}
              />
            ))}
          </RecordGrid>
        ) : (
          <p className="summary">
            활성 내부 계정과 구매 권한을 서버·DB에서 확인한 뒤에만 제공합니다. 외주업체는 내부 구매와 R&amp;D 집행정보를 조회할 수 없습니다.
          </p>
        )}
      </section>
    </main>
  );
}
