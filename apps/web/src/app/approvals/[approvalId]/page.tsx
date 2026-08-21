import { uuid } from "@youone/shared-kernel/public";
import { approvalActionDisabled } from "@youone/ui/public";
import Link from "next/link";
import { approvalInboxQuery } from "../query";

export const dynamic = "force-dynamic";
export default async function ApprovalDetailPage({ params }: { params: Promise<{ approvalId: string }> }) {
  let id; try { id = uuid((await params).approvalId); } catch { return <main className="shell"><section className="hero"><h1>잘못된 결재 식별자</h1></section></main>; }
  const result = await approvalInboxQuery().getMine(id);
  if (result.availability === "UNAVAILABLE") return <main className="shell"><section className="hero"><h1>결재 상세</h1><div className="status" role="status">조회 서비스 연결 전</div><p className="summary">빈 결재로 간주하지 않으며 어떤 결재 동작도 제공하지 않습니다.</p></section></main>;
  const d = result.detail;
  return <main className="shell"><section className="hero"><p className="eyebrow">GENERATION {d.generation} · {d.state}</p><h1>결재 상세</h1><p>{d.subjectKind} v{d.subjectVersion}</p><code>{d.subjectChecksum}</code>{d.previousInstanceId && <p><Link href={`/approvals/${d.previousInstanceId}`}>이전 세대</Link></p>}<h2>봉인 결재선</h2><ol>{d.sealedLine.map((s) => <li key={s.stepId}>{s.role} · {s.completionMode} · {s.required ? "필수" : "선택"}<ul>{s.participants.map((p) => <li key={p.participantId}>{p.displayName} · {p.positionId}</li>)}</ul></li>)}</ol><h2>변경 불가 타임라인</h2><ol>{d.timeline.map((a) => <li key={a.actionId}>{a.kind} · {a.actorDisplayName} · <time>{a.at}</time></li>)}</ol><h2>가능한 동작</h2>{d.actions.map((a) => <button key={a.actionId} disabled={approvalActionDisabled({ id: a.actionId, label: a.label, authorized: a.authorized, commandAvailable: a.commandAvailable, decisionId: a.decisionId, evaluatedAt: a.evaluatedAt, evidenceIds: a.evidenceIds, obligations: a.obligations, denyReasonCode: a.denyReasonCode })} title={a.denyReasonCode ?? (!a.commandAvailable ? "COMMAND_ADAPTER_NOT_CONFIGURED" : undefined)} data-decision-id={a.decisionId}>{a.label}{a.denyReasonCode ? ` — ${a.denyReasonCode}` : !a.commandAvailable ? " — 실행 서비스 연결 전" : ""}</button>)}</section></main>;
}
