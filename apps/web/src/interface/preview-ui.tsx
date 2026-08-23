import Link from "next/link";
import { Children, type ReactNode } from "react";

import { previewDataEnabled } from "../composition/preview-mode";
import { formatDisplayText } from "./display-format";
import { PreviewIcon, RecordTypeIcon } from "./preview-icons";

export function PreviewNotice({ compact = false }: { compact?: boolean }) {
  if (!previewDataEnabled()) return null;

  return (
    <aside className="previewNotice" aria-label="데모 데이터 안내">
      <PreviewIcon name="info" />
      <span><strong>데모 데이터</strong>{compact ? "화면 검토용 샘플 · 실제 기록 아님" : "화면 검토용 샘플이며 실제 저장·결재·지급 기록이 아닙니다."}</span>
    </aside>
  );
}

export function PageBackLink({ href = "/", children = "화면 목록" }: { href?: string; children?: ReactNode }) {
  return <Link className="backLink" href={href}><PreviewIcon name="back" size={15} />{children === "화면 목록" ? "대시보드" : children}</Link>;
}

export function RecordGrid({ children }: { children: ReactNode }) {
  const count = Children.count(children);
  return (
    <div className="recordCollection">
      <div className="collectionHeader">
        <span><PreviewIcon name="collection" /><strong>업무 목록</strong></span>
        <small>총 <b>{count}</b>건</small>
      </div>
      <ul className="recordGrid">{children}</ul>
    </div>
  );
}

function metaTone(value: string) {
  const normalized = value.toUpperCase();
  if (/완료|종결|DONE|APPROVED|ACCEPTED|100/.test(normalized)) return "success";
  if (/중지|기한|지연|반려|위험|STOP|OVERDUE|REJECT|FAILED/.test(normalized)) return "danger";
  if (/대기|검토|상신|예정|REVIEW|PENDING|PLANNED|SUBMITTED/.test(normalized)) return "warning";
  return "neutral";
}

export function RecordCard({
  href,
  title,
  eyebrow,
  meta,
  children
}: {
  href: string;
  title: string;
  eyebrow: string;
  meta: readonly string[];
  children?: ReactNode;
}) {
  return (
    <li className="recordCard">
      <Link href={href}>
        <span className="recordIcon"><RecordTypeIcon href={href} /></span>
        <span className="recordHeading">
          <span className="recordEyebrow">{formatDisplayText(eyebrow)}</span>
          <strong>{formatDisplayText(title)}</strong>
        </span>
        <span className="recordOpen">상세<PreviewIcon name="next" size={15} /></span>
      </Link>
      <div className="recordMeta" aria-label={`${title} 요약`}>
        {meta.map((item) => <span data-tone={metaTone(item)} key={item}>{formatDisplayText(item)}</span>)}
      </div>
      {children}
    </li>
  );
}

export function FactGrid({ facts }: { facts: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="factGrid">
      {facts.map((fact) => (
        <div className="factItem" key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{typeof fact.value === "string" ? formatDisplayText(fact.value) : fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
