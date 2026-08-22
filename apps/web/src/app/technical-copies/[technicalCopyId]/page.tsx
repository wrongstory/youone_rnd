import { notFound } from "next/navigation";

import { FactGrid, PageBackLink, PreviewNotice } from "../../../interface/preview-ui";
import { technicalCopyQuery } from "../query";

export const dynamic = "force-dynamic";

type Props = { readonly params: Promise<{ readonly technicalCopyId: string }> };

export default async function TechnicalCopyDetailPage({ params }: Props) {
  const { technicalCopyId } = await params;
  const result = await technicalCopyQuery().getInternal(technicalCopyId);
  if (result.availability === "NOT_FOUND") notFound();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="technical-copy-detail-title">
        <PageBackLink href="/technical-copies">통제사본 목록</PageBackLink>
        <p className="eyebrow">CONTROLLED COPY · NO SOURCE DOWNLOAD · NO RECIPIENT PRINT</p>
        <h1 id="technical-copy-detail-title">통제사본 상세</h1>
        <PreviewNotice />
        {result.availability === "AVAILABLE" ? (
          <>
            <div className="status" role="status" data-state={result.detail.state}>{result.detail.securityLevel} · {result.detail.state}</div>
            <h2 className="detailTitle">{result.detail.documentTitle}</h2>
            <p className="summary">{result.detail.documentNo} v{result.detail.versionNo} · 신청 {result.detail.requestNo} · 사본 {result.detail.copyNo ?? "승인 후 발급"}</p>
            <FactGrid facts={[
              { label: "정확한 문서버전", value: result.detail.documentVersionId },
              { label: "버전 체크섬", value: result.detail.versionChecksum },
              { label: "수령인", value: result.detail.recipientDisplayName },
              { label: "사용 목적", value: result.detail.purpose },
              { label: "프로젝트", value: result.detail.projectLabel },
              { label: "결재 인스턴스", value: result.detail.approvalInstanceId },
              { label: "페이지", value: result.detail.pageCount ?? "렌더 전" },
              { label: "반납 예정", value: result.detail.returnDueAt }
            ]} />

            <section className="detailSection" aria-labelledby="copy-approval-title">
              <h2 id="copy-approval-title">보안등급별 결재선</h2>
              <ul className="timelineList">
                {result.detail.approvalSteps.map((step) => (
                  <li key={step.role}><strong>{step.label}</strong><span>{step.outcome === "APPROVED" ? `${step.actorDisplayName} · ${step.actedAt}` : "결재 대기 — 완료 전 렌더링 불가"}</span></li>
                ))}
              </ul>
            </section>

            <section className="detailSection" aria-labelledby="copy-watermark-title">
              <h2 id="copy-watermark-title">페이지별 워터마크·무결성</h2>
              {result.detail.watermark ? (
                <>
                  <FactGrid facts={[
                    { label: "수령 업체/수령인", value: result.detail.watermark.recipientVendor },
                    { label: "사본번호", value: result.detail.watermark.copyNo },
                    { label: "보안등급", value: result.detail.watermark.securityLevel },
                    { label: "발급자", value: result.detail.watermark.issuer },
                    { label: "출력시각", value: result.detail.watermark.printedAt },
                    { label: "금지 문구", value: result.detail.watermark.prohibition },
                    { label: "원본 해시", value: result.detail.sourceHash },
                    { label: "출력물 해시", value: result.detail.outputHash }
                  ]} />
                  {result.detail.reprintOfCopyId ? <div className="policyCallout warning"><strong>재출력 이력</strong><p>이전 사본 {result.detail.reprintOfCopyId}을 덮어쓰지 않고 새 번호를 발급했습니다.</p><span>{result.detail.reprintReason}</span></div> : null}
                </>
              ) : <div className="policyCallout warning"><strong>렌더링 잠금</strong><p>필수 결재가 완료되어야 사본번호·워터마크·해시가 생성됩니다.</p></div>}
            </section>

            <section className="detailSection" aria-labelledby="copy-custody-title">
              <h2 id="copy-custody-title">인계·회수/파기 대장</h2>
              <ul className="timelineList">
                {result.detail.custodyEvents.map((event) => (
                  <li key={event.eventId}><strong>{event.label}</strong><span>{event.actorDisplayName} · {event.occurredAt}{event.evidenceCount ? ` · 증빙 ${event.evidenceCount}건` : ""}</span></li>
                ))}
              </ul>
            </section>

            <div className="policyCallout"><strong>전달 원칙</strong><p>L3/L4 원문 파일, 디지털 사본, 수령인 자체 출력은 제공하지 않습니다. 내부 권한자가 워터마크 사본을 직접 출력하고 인계 증빙을 남깁니다.</p></div>
          </>
        ) : (
          <div className="status" role="status" data-availability={result.availability}>{result.availability === "FORBIDDEN" ? "통제사본을 조회할 권한이 없습니다." : "통제사본 조회 서비스가 연결되지 않았습니다. 기록이 없다는 뜻이 아닙니다."}</div>
        )}
      </section>
    </main>
  );
}
