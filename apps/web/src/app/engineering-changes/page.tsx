import {
  availableEngineeringChangeList,
  unavailableEngineeringChangeList
} from "@youone/ui/public";

import { PageBackLink, PreviewNotice, RecordCard, RecordGrid } from "../../interface/preview-ui";
import { engineeringChangeQuery } from "./query";

export const dynamic = "force-dynamic";

export default async function EngineeringChangesPage() {
  const result = await engineeringChangeQuery().listMineExternal();
  const view = result.availability === "AVAILABLE"
    ? availableEngineeringChangeList(result.items.map((change) => ({
        id: change.changeRequestId,
        ecrNo: change.ecrNo,
        ...(change.ecoNo === undefined ? {} : { ecoNo: change.ecoNo }),
        state: change.ecoState ?? change.state,
        priority: change.priority,
        title: change.title,
        ...(change.contractId === undefined ? {} : { contractId: change.contractId }),
        nextAction: change.nextAction ?? "대기"
      })))
    : unavailableEngineeringChangeList();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="change-title">
        <PageBackLink />
        <p className="eyebrow">ECR/ECO · SM-ECR-V1 · SM-ECO-V1</p>
        <h1 id="change-title">설계·공정 변경관리</h1>
        <PreviewNotice />
        <div className="status" role="status" data-availability={view.availability}>{view.message}</div>
        {view.availability === "UNAVAILABLE" ? (
          <p className="summary">
            로그인·Project/Contract Scope 조회 어댑터가 연결되기 전에는 변경 건 수를 추정하지 않습니다. 외주 화면에는
            할당된 변경 대상과 적용·검증 진행만 표시하며 내부 영향검토, 결재선, 계약금액과 법무·보안 메모는 제외합니다.
          </p>
        ) : (
          <RecordGrid>
            {view.items.map((change) => (
              <RecordCard
                key={change.id}
                href={`/engineering-changes/${change.id}`}
                eyebrow={`${change.ecrNo}${change.ecoNo ? ` · ${change.ecoNo}` : ""} · ${change.priority}`}
                title={change.title}
                meta={[`상태 ${change.state}`, `다음 작업 ${change.nextAction}`]}
              />
            ))}
          </RecordGrid>
        )}
      </section>
    </main>
  );
}
