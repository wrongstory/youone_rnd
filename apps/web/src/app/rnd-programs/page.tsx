import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { rndQuery } from "./query";

export const dynamic = "force-dynamic";

const amount = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });

export default async function RndProgramsPage() {
  const result = await rndQuery().listInternalSummaries();
  const message = result.availability === "AVAILABLE"
    ? result.items.length ? "조회할 수 있는 R&D 과제가 있습니다." : "현재 조회할 수 있는 R&D 과제가 없습니다."
    : result.availability === "FORBIDDEN"
      ? "R&D 예산·집행정보를 조회할 권한이 없습니다."
      : "R&D 조회 서비스가 아직 연결되지 않았습니다. 과제가 없다는 뜻이 아닙니다.";

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="rnd-title">
        <PageBackLink />
        <p className="eyebrow">R&amp;D · BUDGET VERSION · EVIDENCE · DEADLINE</p>
        <h1 id="rnd-title">R&amp;D 과제·집행 현황</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={result.availability}>{message}</div>
        {result.availability === "AVAILABLE" ? (
          <RecordGrid>
            {result.items.map((program) => (
              <RecordCard
                key={program.rndProgramId}
                href={`/rnd-programs/${program.rndProgramId}`}
                eyebrow={`${program.programCode} · ${program.managingAgency}`}
                title={program.title}
                meta={[
                  `집행률 ${program.budget.executionRate}%`,
                  `잔액 ${amount.format(Number(program.budget.balance.amount))}`,
                  `증빙 누락 ${program.evidence.missingEvidenceCount}건`,
                  `임박 ${program.deadlines.dueSoon}건`
                ]}
              />
            ))}
          </RecordGrid>
        ) : (
          <p className="summary">내부 R&amp;D 권한과 projection을 서버·DB에서 확인한 뒤에만 제공합니다. 외주 계정은 Scope가 있어도 항상 거부됩니다.</p>
        )}
      </section>
    </main>
  );
}
