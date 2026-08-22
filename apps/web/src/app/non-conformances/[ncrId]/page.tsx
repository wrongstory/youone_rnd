import { ncrCarQuery } from "../query";

export const dynamic = "force-dynamic";

export default async function NonConformanceDetailPage({ params }: { params: Promise<{ ncrId: string }> }) {
  const { ncrId } = await params;
  const result = await ncrCarQuery().getMineExternal(ncrId);
  const message = result.availability === "AVAILABLE"
    ? `${result.detail.ncrNo} · ${result.detail.state}`
    : result.availability === "NOT_FOUND"
      ? "NCR을 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 NCR을 조회할 권한이 없습니다."
        : "NCR/CAR 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="ncr-detail-title">
        <p className="eyebrow">EXTERNAL NCR/CAR DETAIL · EXACT ASSIGNMENT</p>
        <h1 id="ncr-detail-title">NCR/CAR 상세</h1>
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <div>
            <p className="summary">
              심각도 {result.detail.severity} · 담당 CAR {result.detail.assignedCars.length}건
              {result.detail.dueAt ? ` · NCR 기한 ${result.detail.dueAt}` : ""}
            </p>
            <ul>
              {result.detail.assignedCars.map((car) => (
                <li key={car.carId}>{`${car.carNo} · ${car.state} · 기한 ${car.dueAt}`}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="summary">
            활성 계정·VendorMembership·정확한 Project/Contract Scope와 NCR 책임 할당을 서버와 DB에서 모두
            확인한 뒤에만 외부 수행정보를 제공합니다. 외주업체는 발행·계획승인·효과검증·종료·재개방을 할 수 없습니다.
          </p>
        )}
      </section>
    </main>
  );
}
