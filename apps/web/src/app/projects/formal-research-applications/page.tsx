import { ClipboardText, Clock, SealCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { BackendContractNotice, OperationalPageHeader, OperationalStateBadge } from "../../../interface/operational-ui";
import { PageBackLink, PreviewNotice } from "../../../interface/preview-ui";

const applications = [
  { id: "preview-application-001", projectId: "b0000000-0000-4000-8000-000000000001", project: "고효율 배터리 냉각모듈", version: 2, state: "DIRECTOR_REVIEW_PENDING", updatedAt: "2026-08-24 09:15" },
  { id: "preview-application-002", projectId: "b0000000-0000-4000-8000-000000000002", project: "스마트 유압 진단장치", version: 1, state: "DRAFT", updatedAt: "2026-08-23 16:40" }
] as const;

export default function FormalResearchApplicationListPage() {
  return (
    <main className="shell operationalShell">
      <PageBackLink href="/projects">프로젝트</PageBackLink>
      <OperationalPageHeader eyebrow="FORMAL RESEARCH APPLICATION" title="정식 연구과제 신청" description="일반 프로젝트의 별도 불변 신청본과 연구소장 검토·동의 상태를 확인합니다." />
      <PreviewNotice compact /><BackendContractNotice />
      <section className="operationalPanel"><div className="panelHeading"><div><span>APPLICATION ROOTS</span><h2>내 신청·검토 현황</h2></div><ClipboardText aria-hidden size={24} /></div><ul className="applicationList">{applications.map((application) => <li key={application.id}><span className="applicationIcon">{application.state === "DRAFT" ? <Clock aria-hidden size={20} /> : <SealCheck aria-hidden size={20} />}</span><div><strong>{application.project}</strong><span>신청본 v{application.version} · {application.updatedAt}</span></div><OperationalStateBadge tone={application.state === "DRAFT" ? "neutral" : "warning"}>{application.state}</OperationalStateBadge><Link href={`/projects/${application.projectId}/formal-research-applications/new`}>{application.state === "DRAFT" ? "작성 계속" : "신청본 보기"}</Link></li>)}</ul></section>
    </main>
  );
}

