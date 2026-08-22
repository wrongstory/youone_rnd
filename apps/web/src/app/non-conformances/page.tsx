import { availableNonConformanceList, unavailableNonConformanceList } from "@youone/ui/public";
import Link from "next/link";

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
        <p className="eyebrow">NCR/CAR · SM-NCR-V1 · SM-CAR-V1</p>
        <h1 id="ncr-title">부적합 및 시정조치</h1>
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">
            로그인·Vendor Scope 조회 어댑터가 연결되기 전에는 부적합 건 수를 추정하지 않습니다. 외주 화면에는
            자신에게 할당된 containment와 CAR 수행정보만 표시하며 내부 책임검토, 계약 금액, 지급률과 결재정보는
            포함하지 않습니다.
          </p>
        ) : (
          <ul>
            {view.items.map((ncr) => (
              <li key={ncr.id}>
                <Link href={`/non-conformances/${ncr.id}`}>{ncr.ncrNo}</Link>
                {` · ${ncr.severity} · ${ncr.state}${ncr.dueAt ? ` · 기한 ${ncr.dueAt}` : ""}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
