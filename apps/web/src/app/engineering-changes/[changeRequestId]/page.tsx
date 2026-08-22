import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { engineeringChangeQuery } from "../query";

export const dynamic = "force-dynamic";

const impactLabel = {
  cost: "비용",
  schedule: "일정",
  quality: "품질",
  safety: "안전",
  security: "보안",
  regulatory: "규제"
} as const;

export default async function EngineeringChangeDetailPage({
  params
}: {
  params: Promise<{ changeRequestId: string }>;
}) {
  const { changeRequestId } = await params;
  const result = await engineeringChangeQuery().getMineExternal(changeRequestId);
  const message = result.availability === "AVAILABLE"
    ? `${result.detail.ecrNo}${result.detail.ecoNo ? ` · ${result.detail.ecoNo}` : ""}`
    : result.availability === "NOT_FOUND"
      ? "ECR을 찾을 수 없습니다."
      : result.availability === "FORBIDDEN"
        ? "이 변경 건을 조회할 권한이 없습니다."
        : "ECR/ECO 상세 조회 서비스 연결 전";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="change-detail-title">
        <PageBackLink href="/engineering-changes">ECR/ECO</PageBackLink>
        <p className="eyebrow">EXACT TARGET · NEW VERSION · INDEPENDENT VERIFICATION</p>
        <h1 id="change-detail-title">변경요청·변경지시 상세</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <>
            <FactGrid facts={[
              { label: "변경 제목", value: result.detail.title },
              { label: "우선순위", value: result.detail.priority },
              { label: "ECR 상태", value: result.detail.state },
              { label: "ECO 상태", value: result.detail.ecoState ?? "미생성" },
              { label: "대상 진행", value: `${result.detail.progress.implementedTargets}/${result.detail.progress.totalTargets}` },
              { label: "독립 검증", value: result.detail.progress.verification }
            ]} />

            <section className="detailSection" aria-labelledby="impact-title">
              <h2 id="impact-title">영향분석 6개 축</h2>
              <ul className="timelineList">
                {Object.entries(result.detail.impactSummary).map(([dimension, finding]) => (
                  <li key={dimension}>
                    <strong>{impactLabel[dimension as keyof typeof impactLabel]}</strong>
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="detailSection" aria-labelledby="target-title">
              <h2 id="target-title">정확한 변경대상·버전</h2>
              <ul className="timelineList">
                {result.detail.exactTargetDisplayRefs.map((target) => (
                  <li key={target.targetId}>
                    <strong>{target.kind}</strong>
                    <span>{target.displayRef}</span>
                  </li>
                ))}
              </ul>
            </section>

            {result.detail.appliedScope ? (
              <section className="detailSection" aria-labelledby="scope-title">
                <h2 id="scope-title">적용 범위</h2>
                <FactGrid facts={[
                  { label: "Serial", value: result.detail.appliedScope.serialNumbers.join(", ") || "미기록" },
                  { label: "Lot", value: result.detail.appliedScope.lotNumbers.join(", ") || "미기록" },
                  { label: "설비", value: result.detail.appliedScope.equipmentIds.join(", ") || "미기록" }
                ]} />
              </section>
            ) : null}

            <div className="policyCallout warning">
              <strong>변경 통제 원칙</strong>
              <p>승인된 원본은 덮어쓰지 않습니다. 계약조건 변경은 별도 서명·발효된 변경계약이 있어야 효력이 생기며, 긴급변경 정책이 없으면 긴급경로는 차단됩니다.</p>
            </div>
          </>
        ) : (
          <p className="summary">활성 계정, exact Project/Contract Scope와 변경 할당을 서버와 DB에서 확인한 뒤에만 외부 수행정보를 제공합니다.</p>
        )}
      </section>
    </main>
  );
}
